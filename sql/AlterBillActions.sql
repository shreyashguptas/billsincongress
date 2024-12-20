-- First, verify that all IDs in bill_actions exist in bill_info
DO $$ 
BEGIN
    IF EXISTS (
        SELECT ba.id 
        FROM bill_actions ba
        LEFT JOIN bill_info bi ON ba.id = bi.id
        WHERE bi.id IS NULL
    ) THEN
        RAISE EXCEPTION 'There are bill_actions records with IDs that do not exist in bill_info';
    END IF;
END $$;

-- Remove the existing primary key constraint
ALTER TABLE bill_actions 
DROP CONSTRAINT bill_actions_pkey;

-- Add new primary key constraint
-- This makes id, action_code, and action_date together unique
ALTER TABLE bill_actions 
ADD PRIMARY KEY (id, action_code, action_date);

-- Add foreign key constraint
ALTER TABLE bill_actions 
ADD CONSTRAINT fk_bill_actions_bill_info 
FOREIGN KEY (id) 
REFERENCES bill_info(id)
ON DELETE CASCADE;

-- Add an index on the foreign key for better performance
CREATE INDEX IF NOT EXISTS idx_bill_actions_bill_info_id 
ON bill_actions(id); 