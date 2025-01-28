CREATE POLICY "Allow public read access" ON "public"."bill_titles" --made the change for all tables
FOR SELECT
TO public
USING (true);

-- First, let's create a policy that allows anyone to read bill_info data
CREATE POLICY "Enable read access for all users" ON "public"."bill_info"
    FOR SELECT
    USING (true);

-- If you want to be more specific about the congress numbers access
CREATE POLICY "Enable congress numbers access for all users" ON "public"."bill_info"
    FOR SELECT
    USING (true)
    WITH CHECK (congress IS NOT NULL);

-- Enable RLS on the table (although it's already enabled in your case)
ALTER TABLE "public"."bill_info" ENABLE ROW LEVEL SECURITY;

-- First, grant the necessary SELECT permissions
GRANT SELECT ON "public"."bill_info" TO anon;
GRANT SELECT ON "public"."bill_info" TO authenticated;
GRANT SELECT ON "public"."bill_info" TO public;

-- Drop any existing restrictive policies if needed
-- DROP POLICY IF EXISTS "Restrict congress access" ON "public"."bill_info";

-- Verify the policies after creation
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'bill_info'
ORDER BY policyname;

-- No need to create new policies since we already have them
-- But let's verify after granting permissions
SELECT 
    grantee, 
    privilege_type, 
    is_grantable
FROM information_schema.role_table_grants 
WHERE table_name = 'bill_info'
ORDER BY grantee, privilege_type;