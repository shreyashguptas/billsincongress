-- First, verify that all IDs in bill_subjects exist in bill_info
DO $$ 
BEGIN
    IF EXISTS (
        SELECT bs.id 
        FROM bill_subjects bs
        LEFT JOIN bill_info bi ON bs.id = bi.id
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION 'There are bill_subjects records with IDs that do not exist in bill_info';
    END IF;
END $$;

-- Remove the existing primary key constraint
ALTER TABLE bill_subjects 
DROP CONSTRAINT bill_subjects_pkey;

-- Add new primary key constraint
-- This makes id the primary key since it's a one-to-one relationship
ALTER TABLE bill_subjects 
ADD PRIMARY KEY (id);

-- Add foreign key constraint
ALTER TABLE bill_subjects 
ADD CONSTRAINT fk_bill_subjects_bill_info 
FOREIGN KEY (id) 
REFERENCES bill_info(id)
ON DELETE CASCADE;

-- Add an index on the foreign key for better performance
CREATE INDEX IF NOT EXISTS idx_bill_subjects_bill_info_id 
ON bill_subjects(id); 