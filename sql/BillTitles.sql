-- Create the bill_titles table
CREATE TABLE IF NOT EXISTS bill_titles (
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    title_type TEXT NOT NULL,
    title_type_code INTEGER NOT NULL,
    update_date TIMESTAMP WITH TIME ZONE NOT NULL,
    bill_text_version_code TEXT,
    bill_text_version_name TEXT,
    chamber_code TEXT,
    chamber_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Make composite primary key since one bill can have multiple titles
    PRIMARY KEY (id, title_type_code, title),
    -- Add foreign key constraint
    FOREIGN KEY (id) 
    REFERENCES bill_info(id)
    ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bill_titles_id ON bill_titles(id);
CREATE INDEX IF NOT EXISTS idx_bill_titles_title_type ON bill_titles(title_type);
CREATE INDEX IF NOT EXISTS idx_bill_titles_title_type_code ON bill_titles(title_type_code);
CREATE INDEX IF NOT EXISTS idx_bill_titles_chamber_code ON bill_titles(chamber_code);
CREATE INDEX IF NOT EXISTS idx_bill_titles_bill_info_id ON bill_titles(id);

-- Enable Row Level Security
ALTER TABLE bill_titles ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow authenticated users to read bill_titles"
    ON bill_titles
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy that only allows service role to insert/update
CREATE POLICY "Allow service role to insert/update bill_titles"
    ON bill_titles
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

CREATE TRIGGER update_bill_titles_updated_at
    BEFORE UPDATE ON bill_titles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 