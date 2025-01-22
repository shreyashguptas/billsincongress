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

-- Bill Progress Calculation Function
-- Security: Set search_path to prevent schema poisoning
CREATE OR REPLACE FUNCTION calculate_bill_progress()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    latest_action RECORD;
BEGIN
    -- Get the latest action for this bill
    SELECT * INTO latest_action
    FROM bill_actions
    WHERE id = NEW.id
    ORDER BY action_date DESC, created_at DESC
    LIMIT 1;

    -- Update bill_info with the latest action details
    IF FOUND THEN
        NEW.latest_action_date = latest_action.action_date;
        NEW.latest_action_text = latest_action.text;
        NEW.latest_action_code = latest_action.action_code;
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

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