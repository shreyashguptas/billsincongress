CREATE POLICY "Allow public read access" ON "public"."bill_titles" --made the change for all tables
FOR SELECT
TO public
USING (true);