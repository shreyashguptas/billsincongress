-- Bill Related Tables Triggers
-- These triggers automatically update the updated_at column whenever a record is modified

-- Bill Actions Table
CREATE TRIGGER update_bill_actions_updated_at
  BEFORE UPDATE ON bill_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill Info Table
CREATE TRIGGER update_bill_info_updated_at
  BEFORE UPDATE ON bill_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill Subjects Table
CREATE TRIGGER update_bill_subjects_updated_at
  BEFORE UPDATE ON bill_subjects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill Summaries Table
CREATE TRIGGER update_bill_summaries_updated_at
  BEFORE UPDATE ON bill_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill Text Table
CREATE TRIGGER update_bill_text_updated_at
  BEFORE UPDATE ON bill_text
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Bill Titles Table
CREATE TRIGGER update_bill_titles_updated_at
  BEFORE UPDATE ON bill_titles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Security and Encryption Related Triggers
-- These triggers handle encryption of sensitive data

-- Key Table Encryption Triggers
CREATE TRIGGER key_encrypt_secret_trigger_raw_key
  BEFORE INSERT OR UPDATE ON key
  FOR EACH ROW
  EXECUTE FUNCTION pgsodium.key_encrypt_secret_raw_key();

-- Secrets Table Encryption Triggers
CREATE TRIGGER secrets_encrypt_secret_trigger_secret
  BEFORE INSERT OR UPDATE ON secrets
  FOR EACH ROW
  EXECUTE FUNCTION vault.secrets_encrypt_secret_secret();

-- Storage Related Triggers
-- These triggers handle storage object updates

-- Objects Table
CREATE TRIGGER update_objects_updated_at
  BEFORE UPDATE ON objects
  FOR EACH ROW
  EXECUTE FUNCTION storage.update_updated_at_column();

-- Realtime Subscription Triggers
-- These triggers handle realtime subscription filter checks

-- Subscription Table
CREATE TRIGGER tr_check_filters
  BEFORE INSERT OR UPDATE ON subscription
  FOR EACH ROW
  EXECUTE FUNCTION realtime.subscription_check_filters();

-- Helper Functions
-- These are the functions used by the triggers above

-- Update Updated At Column Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Note: Other functions (pgsodium.key_encrypt_secret_raw_key, 
-- vault.secrets_encrypt_secret_secret, storage.update_updated_at_column,
-- and realtime.subscription_check_filters) are provided by Supabase
-- and their implementations are managed by the platform. 