-- Create the bill_info table
CREATE TABLE IF NOT EXISTS bill_info (
    id TEXT PRIMARY KEY,
    introduced_date DATE NOT NULL,
    sponsor_bioguide_id TEXT,
    sponsor_district INTEGER,
    sponsor_first_name TEXT,
    sponsor_last_name TEXT,
    sponsor_party TEXT,
    sponsor_state TEXT,
    sponsor_is_by_request TEXT,
    update_date TIMESTAMP WITH TIME ZONE,
    update_date_including_text TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bill_info_sponsor_bioguide_id ON bill_info(sponsor_bioguide_id);
CREATE INDEX IF NOT EXISTS idx_bill_info_introduced_date ON bill_info(introduced_date);

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