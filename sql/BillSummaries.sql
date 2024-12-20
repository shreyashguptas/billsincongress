-- Create the bill_summaries table
CREATE TABLE IF NOT EXISTS bill_summaries (
    id TEXT NOT NULL,
    action_date DATE NOT NULL,
    action_desc TEXT NOT NULL,
    text TEXT NOT NULL,
    update_date TIMESTAMP WITH TIME ZONE NOT NULL,
    version_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Make composite primary key since one bill can have multiple summaries
    PRIMARY KEY (id, version_code),
    -- Add foreign key constraint
    FOREIGN KEY (id) 
    REFERENCES bill_info(id)
    ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bill_summaries_id ON bill_summaries(id);
CREATE INDEX IF NOT EXISTS idx_bill_summaries_action_date ON bill_summaries(action_date);
CREATE INDEX IF NOT EXISTS idx_bill_summaries_version_code ON bill_summaries(version_code);
CREATE INDEX IF NOT EXISTS idx_bill_summaries_bill_info_id ON bill_summaries(id);

-- Enable Row Level Security
ALTER TABLE bill_summaries ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow authenticated users to read bill_summaries"
    ON bill_summaries
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy that only allows service role to insert/update
CREATE POLICY "Allow service role to insert/update bill_summaries"
    ON bill_summaries
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

CREATE TRIGGER update_bill_summaries_updated_at
    BEFORE UPDATE ON bill_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 