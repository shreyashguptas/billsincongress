-- First, verify that all IDs in bill_titles exist in bill_info
DO $$ 
BEGIN
    IF EXISTS (
        SELECT bt.id 
        FROM bill_titles bt
        LEFT JOIN bill_info bi ON bt.id = bi.id
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION 'There are bill_titles records with IDs that do not exist in bill_info';
    END IF;
END $$;

-- Remove the existing primary key constraint
ALTER TABLE bill_titles 
DROP CONSTRAINT bill_titles_pkey;

-- Add new primary key constraint
-- This makes id, title_type_code, and title together unique since one bill can have multiple titles
ALTER TABLE bill_titles 
ADD PRIMARY KEY (id, title_type_code, title);

-- Add foreign key constraint
ALTER TABLE bill_titles 
ADD CONSTRAINT fk_bill_titles_bill_info 
FOREIGN KEY (id) 
REFERENCES bill_info(id)
ON DELETE CASCADE;

-- Add an index on the foreign key for better performance
CREATE INDEX IF NOT EXISTS idx_bill_titles_bill_info_id 
ON bill_titles(id); 