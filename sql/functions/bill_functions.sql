-- Helper Functions for Bill Processing
-- These functions are used by various triggers and operations

-- Update Updated At Column Function
-- Security: Set search_path to prevent schema poisoning
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate bill progress based on actions
CREATE OR REPLACE FUNCTION calculate_bill_progress()
RETURNS TRIGGER AS $$
BEGIN
    WITH latest_action AS (
        SELECT DISTINCT ON (id) 
            id,
            action_code, 
            action_date, 
            text, 
            type,
            source_system_code
        FROM bill_actions
        WHERE id = NEW.id
        ORDER BY id, action_date DESC, action_code DESC
    ),
    -- Check for passage in each chamber
    chamber_passage AS (
        SELECT 
            id,
            bool_or(
                (action_code = '8000' AND source_system_code = 9) OR  -- Library of Congress House passage
                (action_code LIKE 'H%' AND source_system_code = 2 AND (
                    action_code = 'H38310' OR  -- House passage codes
                    action_code = 'H37300' OR
                    text ILIKE '%Passed the House%'
                ))
            ) as passed_house,
            bool_or(
                (action_code = '17000' AND source_system_code = 9) OR  -- Library of Congress Senate passage
                (action_code LIKE 'S%' AND source_system_code = 3 AND (
                    text ILIKE '%Passed Senate%'
                ))
            ) as passed_senate
        FROM bill_actions
        WHERE id = NEW.id
        GROUP BY id
    ),
    bill_status AS (
        SELECT 
            CASE
                WHEN (action_code IN ('36000', 'E40000') AND source_system_code = 9)
                    OR type = 'BecameLaw' 
                    OR text ILIKE '%Became Public Law%' THEN 100
                WHEN (action_code IN ('29000', 'E30000') AND source_system_code = 9)
                    OR text ILIKE '%Signed by President%' THEN 90
                WHEN (action_code IN ('28000', 'E20000') AND source_system_code = 9)
                    OR text ILIKE '%Presented to President%' THEN 80
                WHEN EXISTS (
                    SELECT 1 FROM chamber_passage 
                    WHERE id = latest_action.id 
                    AND passed_house AND passed_senate
                ) THEN 70
                WHEN EXISTS (
                    SELECT 1 FROM chamber_passage 
                    WHERE id = latest_action.id 
                    AND (passed_house OR passed_senate)
                ) THEN 60
                WHEN (action_code IN ('5000', '14000') AND source_system_code = 9)
                    OR type = 'Reported' THEN 40
                WHEN (action_code IN ('1000', '10000') AND source_system_code = 9)
                    OR type = 'IntroReferral' THEN 20
                ELSE 20
            END as stage,
            CASE
                WHEN (action_code IN ('36000', 'E40000') AND source_system_code = 9)
                    OR type = 'BecameLaw' 
                    OR text ILIKE '%Became Public Law%' THEN 'Became Law'
                WHEN (action_code IN ('29000', 'E30000') AND source_system_code = 9)
                    OR text ILIKE '%Signed by President%' THEN 'Signed by President'
                WHEN (action_code IN ('28000', 'E20000') AND source_system_code = 9)
                    OR text ILIKE '%Presented to President%' THEN 'To President'
                WHEN EXISTS (
                    SELECT 1 FROM chamber_passage 
                    WHERE id = latest_action.id 
                    AND passed_house AND passed_senate
                ) THEN 'Passed Both Chambers'
                WHEN EXISTS (
                    SELECT 1 FROM chamber_passage 
                    WHERE id = latest_action.id 
                    AND (passed_house OR passed_senate)
                ) THEN 'Passed One Chamber'
                WHEN (action_code IN ('5000', '14000') AND source_system_code = 9)
                    OR type = 'Reported' THEN 'In Committee'
                WHEN (action_code IN ('1000', '10000') AND source_system_code = 9)
                    OR type = 'IntroReferral' THEN 'Introduced'
                ELSE 'Introduced'
            END as description
        FROM latest_action
    )
    UPDATE bill_info
    SET 
        progress_stage = bill_status.stage,
        progress_description = bill_status.description
    FROM bill_status
    WHERE bill_info.id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger
DROP TRIGGER IF EXISTS update_bill_progress ON bill_actions;
CREATE TRIGGER update_bill_progress
AFTER INSERT OR UPDATE ON bill_actions
FOR EACH ROW
EXECUTE FUNCTION calculate_bill_progress();

-- Bill Status Update Function
-- Security: Set search_path to prevent schema poisoning
CREATE OR REPLACE FUNCTION update_bill_status()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update the bill status based on the latest action
    IF NEW.latest_action_code IS NOT NULL THEN
        -- Became Law
        IF NEW.latest_action_code IN ('36000', 'E40000') THEN
            NEW.progress_stage = 6;
            NEW.progress_description = 'Became Law';
        -- Signed by President
        ELSIF NEW.latest_action_code IN ('29000', 'E30000') THEN
            NEW.progress_stage = 5;
            NEW.progress_description = 'Signed by President';
        -- To President
        ELSIF NEW.latest_action_code IN ('28000', 'E20000') THEN
            NEW.progress_stage = 4;
            NEW.progress_description = 'To President';
        -- Passed Both Chambers
        ELSIF EXISTS (
            SELECT 1 FROM bill_actions 
            WHERE id = NEW.id 
            AND (
                (action_code = 'H32500' AND EXISTS (
                    SELECT 1 FROM bill_actions b2 
                    WHERE b2.id = NEW.id 
                    AND b2.action_code = 'S32500'
                ))
                OR 
                (action_code = 'S32500' AND EXISTS (
                    SELECT 1 FROM bill_actions b2 
                    WHERE b2.id = NEW.id 
                    AND b2.action_code = 'H32500'
                ))
            )
        ) THEN
            NEW.progress_stage = 3;
            NEW.progress_description = 'Passed Both Chambers';
        -- Passed One Chamber
        ELSIF EXISTS (
            SELECT 1 FROM bill_actions 
            WHERE id = NEW.id 
            AND action_code IN ('H32500', 'S32500')
        ) THEN
            NEW.progress_stage = 2;
            NEW.progress_description = 'Passed One Chamber';
        -- In Committee
        ELSIF EXISTS (
            SELECT 1 FROM bill_actions 
            WHERE id = NEW.id 
            AND action_code IN ('5000', '14000', 'H11100', 'S11100')
        ) THEN
            NEW.progress_stage = 1;
            NEW.progress_description = 'In Committee';
        -- Introduced
        ELSE
            NEW.progress_stage = 0;
            NEW.progress_description = 'Introduced';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql'; 