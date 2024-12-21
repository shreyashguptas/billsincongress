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
    latest_action_code INTEGER,
    latest_action_date TIMESTAMP WITH TIME ZONE,
    latest_action_text TEXT,
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