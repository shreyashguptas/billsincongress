-- First, verify that all IDs in bill_summaries exist in bill_info
DO $$ 
BEGIN
    IF EXISTS (
        SELECT bs.id 
        FROM bill_summaries bs
        LEFT JOIN bill_info bi ON bs.id = bi.id
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION 'There are bill_summaries records with IDs that do not exist in bill_info';
    END IF;
END $$;

-- Remove the existing primary key constraint
ALTER TABLE bill_summaries 
DROP CONSTRAINT bill_summaries_pkey;

-- Add new primary key constraint
-- This makes id and version_code together unique since one bill can have multiple summaries
ALTER TABLE bill_summaries 
ADD PRIMARY KEY (id, version_code);

-- Add foreign key constraint
ALTER TABLE bill_summaries 
ADD CONSTRAINT fk_bill_summaries_bill_info 
FOREIGN KEY (id) 
REFERENCES bill_info(id)
ON DELETE CASCADE;

-- Add an index on the foreign key for better performance
CREATE INDEX IF NOT EXISTS idx_bill_summaries_bill_info_id 
ON bill_summaries(id); 