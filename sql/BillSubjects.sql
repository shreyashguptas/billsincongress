-- Create the bill_subjects table
CREATE TABLE IF NOT EXISTS bill_subjects (
    id TEXT NOT NULL,
    policy_area_name TEXT NOT NULL,
    policy_area_update_date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Make id the primary key since it's a one-to-one relationship
    PRIMARY KEY (id),
    -- Add foreign key constraint
    FOREIGN KEY (id) 
    REFERENCES bill_info(id)
    ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bill_subjects_policy_area_name ON bill_subjects(policy_area_name);
CREATE INDEX IF NOT EXISTS idx_bill_subjects_policy_area_update_date ON bill_subjects(policy_area_update_date);
CREATE INDEX IF NOT EXISTS idx_bill_subjects_bill_info_id ON bill_subjects(id);

-- Enable Row Level Security
ALTER TABLE bill_subjects ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow authenticated users to read bill_subjects"
    ON bill_subjects
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy that only allows service role to insert/update
CREATE POLICY "Allow service role to insert/update bill_subjects"
    ON bill_subjects
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

CREATE TRIGGER update_bill_subjects_updated_at
    BEFORE UPDATE ON bill_subjects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 