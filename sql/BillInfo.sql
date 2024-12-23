-- Create the bill_info table
CREATE TABLE IF NOT EXISTS bill_info (
    id TEXT PRIMARY KEY,
    congress INTEGER NOT NULL,
    bill_type TEXT NOT NULL,
    bill_number TEXT NOT NULL,
    title TEXT NOT NULL,
    title_without_number TEXT,
    bill_type_label TEXT NOT NULL,
    introduced_date TIMESTAMP WITH TIME ZONE NOT NULL,
    sponsor_first_name TEXT NOT NULL,
    sponsor_last_name TEXT NOT NULL,
    sponsor_party TEXT NOT NULL,
    sponsor_state TEXT NOT NULL,
    progress_stage INTEGER,
    progress_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE bill_info ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow authenticated users to read bill_info"
    ON bill_info
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy that only allows service role to insert/update
CREATE POLICY "Allow service role to insert/update bill_info"
    ON bill_info
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bill_info_updated_at
    BEFORE UPDATE ON bill_info
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create bill progress calculation trigger function
CREATE OR REPLACE FUNCTION calculate_bill_progress()
RETURNS TRIGGER AS $$
BEGIN
    WITH latest_action AS (
        SELECT DISTINCT ON (id) 
            id,
            action_code, 
            action_date, 
            text, 
            type
        FROM bill_actions
        WHERE id = NEW.id
        ORDER BY id, action_date DESC, action_code DESC
    ),
    bill_status AS (
        SELECT 
            CASE
                WHEN action_code IN ('36000', 'E40000') 
                    OR type = 'BecameLaw' 
                    OR text ILIKE '%Became Public Law%' THEN 100
                WHEN action_code IN ('29000', 'E30000') 
                    OR text ILIKE '%Signed by President%' THEN 90
                WHEN action_code IN ('28000', 'E20000') 
                    OR text ILIKE '%Presented to President%' THEN 90
                WHEN EXISTS (
                    SELECT 1 FROM bill_actions 
                    WHERE id = NEW.id 
                    AND (
                        action_code IN ('17000', '8000', 'E10000') 
                        OR type IN ('PassedSenate', 'PassedHouse')
                        OR text ILIKE '%Passed%'
                    )
                ) THEN 80
                WHEN action_code IN ('17000', '8000', 'E10000') 
                    OR type IN ('PassedSenate', 'PassedHouse') THEN 60
                WHEN action_code IN ('5000', '14000') 
                    OR type = 'Reported' THEN 40
                WHEN action_code IN ('1000', '10000') 
                    OR type = 'IntroReferral' THEN 20
                ELSE 20
            END as stage,
            CASE
                WHEN action_code IN ('36000', 'E40000') 
                    OR type = 'BecameLaw' 
                    OR text ILIKE '%Became Public Law%' THEN 'Became Law'
                WHEN action_code IN ('29000', 'E30000') 
                    OR text ILIKE '%Signed by President%' THEN 'Signed by President'
                WHEN action_code IN ('28000', 'E20000') 
                    OR text ILIKE '%Presented to President%' THEN 'To President'
                WHEN EXISTS (
                    SELECT 1 FROM bill_actions 
                    WHERE id = NEW.id 
                    AND (
                        action_code IN ('17000', '8000', 'E10000') 
                        OR type IN ('PassedSenate', 'PassedHouse')
                        OR text ILIKE '%Passed%'
                    )
                ) THEN 'Passed Both Chambers'
                WHEN action_code IN ('17000', '8000', 'E10000') 
                    OR type IN ('PassedSenate', 'PassedHouse') THEN 'Passed One Chamber'
                WHEN action_code IN ('5000', '14000') 
                    OR type = 'Reported' THEN 'In Committee'
                WHEN action_code IN ('1000', '10000') 
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
$$ LANGUAGE plpgsql;

-- Create trigger to update bill progress on action changes
CREATE TRIGGER update_bill_progress
AFTER INSERT OR UPDATE ON bill_actions
FOR EACH ROW
EXECUTE FUNCTION calculate_bill_progress(); 