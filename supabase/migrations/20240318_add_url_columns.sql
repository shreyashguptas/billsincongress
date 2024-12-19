-- Add new columns for bill text and PDF URLs
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS bill_text_url text,
ADD COLUMN IF NOT EXISTS bill_pdf_url text; 