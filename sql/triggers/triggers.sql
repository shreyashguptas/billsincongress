-- Bill Action Triggers
-- These triggers respond to changes in bill actions and other events

-- Trigger to update bill progress when actions change
CREATE TRIGGER update_bill_progress
AFTER INSERT OR UPDATE ON bill_actions
FOR EACH ROW
EXECUTE FUNCTION calculate_bill_progress();

-- Trigger to update bill status when actions change
CREATE TRIGGER update_bill_status
AFTER INSERT OR UPDATE ON bill_actions
FOR EACH ROW
EXECUTE FUNCTION update_bill_status();

-- Trigger to update the updated_at timestamp on all relevant tables
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON bills
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add additional triggers as needed for other tables
CREATE TRIGGER set_timestamp_actions
BEFORE UPDATE ON bill_actions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column(); 