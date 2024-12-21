-- Add new columns without NOT NULL constraint first
ALTER TABLE bill_info 
ADD COLUMN IF NOT EXISTS congress INTEGER,
ADD COLUMN IF NOT EXISTS bill_type TEXT,
ADD COLUMN IF NOT EXISTS bill_number TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS title_without_number TEXT,
ADD COLUMN IF NOT EXISTS bill_type_label TEXT;

-- Update existing rows with data from the ID
UPDATE bill_info
SET 
    bill_number = SPLIT_PART(id, 'hr', 1),
    bill_type = CASE 
        WHEN id LIKE '%hr%' THEN 'hr'
        WHEN id LIKE '%s%' THEN 's'
        ELSE NULL
    END,
    congress = CAST(RIGHT(id, 3) AS INTEGER),
    bill_type_label = CASE 
        WHEN id LIKE '%hr%' THEN 'H.R.'
        WHEN id LIKE '%s%' THEN 'S.'
        ELSE NULL
    END;

-- Now we can set NOT NULL constraints after data is populated
ALTER TABLE bill_info 
ALTER COLUMN congress SET NOT NULL,
ALTER COLUMN bill_type SET NOT NULL,
ALTER COLUMN bill_number SET NOT NULL,
ALTER COLUMN bill_type_label SET NOT NULL;

-- Drop old columns we don't need anymore (only if you're sure they're not needed)
ALTER TABLE bill_info 
DROP COLUMN IF EXISTS sponsor_bioguide_id,
DROP COLUMN IF EXISTS sponsor_district,
DROP COLUMN IF EXISTS sponsor_is_by_request,
DROP COLUMN IF EXISTS update_date,
DROP COLUMN IF EXISTS update_date_including_text;

-- Make sure the trigger exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_bill_info_updated_at') THEN
        CREATE TRIGGER update_bill_info_updated_at
        BEFORE UPDATE ON bill_info
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;