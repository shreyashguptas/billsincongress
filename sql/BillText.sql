-- Create the bill_text table
CREATE TABLE IF NOT EXISTS bill_text (
    id TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    formats_url_txt TEXT NOT NULL,
    formats_url_pdf TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Make composite primary key since one bill can have multiple text versions
    PRIMARY KEY (id, date, type),
    -- Add foreign key constraint
    FOREIGN KEY (id) 
    REFERENCES bill_info(id)
    ON DELETE CASCADE
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_bill_text_id ON bill_text(id);
CREATE INDEX IF NOT EXISTS idx_bill_text_date ON bill_text(date);
CREATE INDEX IF NOT EXISTS idx_bill_text_type ON bill_text(type);
CREATE INDEX IF NOT EXISTS idx_bill_text_bill_info_id ON bill_text(id);

-- Enable Row Level Security
ALTER TABLE bill_text ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read
CREATE POLICY "Allow authenticated users to read bill_text"
    ON bill_text
    FOR SELECT
    TO authenticated
    USING (true);

-- Create a policy that only allows service role to insert/update
CREATE POLICY "Allow service role to insert/update bill_text"
    ON bill_text
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

CREATE TRIGGER update_bill_text_updated_at
    BEFORE UPDATE ON bill_text
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 