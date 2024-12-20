-- Create the bill_actions table
CREATE TABLE IF NOT EXISTS bill_actions (
    id TEXT NOT NULL,
    action_code TEXT NOT NULL,
    action_date DATE NOT NULL,
    source_system_code INTEGER NOT NULL,
    source_system_name TEXT NOT NULL,
    text TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Make composite primary key since one bill can have multiple actions
    PRIMARY KEY (id, action_code, action_date),
    -- Add foreign key constraint
    FOREIGN KEY (id) 
    REFERENCES bill_info(id)
    ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bill_actions_id ON bill_actions(id);
CREATE INDEX IF NOT EXISTS idx_bill_actions_action_date ON bill_actions(action_date);
CREATE INDEX IF NOT EXISTS idx_bill_actions_type ON bill_actions(type);
CREATE INDEX IF NOT EXISTS idx_bill_actions_bill_info_id ON bill_actions(id);

-- Enable Row Level Security
ALTER TABLE bill_actions ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow authenticated users to read bill_actions"
    ON bill_actions
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy that only allows service role to insert/update
CREATE POLICY "Allow service role to insert/update bill_actions"
    ON bill_actions
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

CREATE TRIGGER update_bill_actions_updated_at
    BEFORE UPDATE ON bill_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 