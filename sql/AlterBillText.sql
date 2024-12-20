-- First, verify that all IDs in bill_text exist in bill_info
DO $$ 
BEGIN
    IF EXISTS (
        SELECT bt.id 
        FROM bill_text bt
        LEFT JOIN bill_info bi ON bt.id = bi.id
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION 'There are bill_text records with IDs that do not exist in bill_info';
    END IF;
END $$;

-- Remove the existing primary key constraint
ALTER TABLE bill_text 
DROP CONSTRAINT bill_text_pkey;

-- Add new primary key constraint
-- This makes id, date, and type together unique since one bill can have multiple text versions
ALTER TABLE bill_text 
ADD PRIMARY KEY (id, date, type);

-- Add foreign key constraint
ALTER TABLE bill_text 
ADD CONSTRAINT fk_bill_text_bill_info 
FOREIGN KEY (id) 
REFERENCES bill_info(id)
ON DELETE CASCADE;

-- Add an index on the foreign key for better performance
CREATE INDEX IF NOT EXISTS idx_bill_text_bill_info_id 
ON bill_text(id); 