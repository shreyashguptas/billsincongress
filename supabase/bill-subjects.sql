CREATE TABLE bill_subjects (
    id SERIAL PRIMARY KEY,
    congress_number INTEGER NOT NULL,
    session_number INTEGER NOT NULL,
    origin_chamber_code CHAR(1) NOT NULL,
    bill_number INTEGER NOT NULL,
    bill_type VARCHAR(10) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (congress_number, session_number, origin_chamber_code, bill_number, bill_type) 
        REFERENCES bills (congress_number, session_number, origin_chamber_code, bill_number, bill_type)
)
-- Row level security is enabled on this table.