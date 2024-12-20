CREATE TABLE bills (
    -- Natural composite key
    congress_number INTEGER NOT NULL,
    session_number INTEGER NOT NULL,
    origin_chamber_code CHAR(1) NOT NULL CHECK (origin_chamber_code IN ('H', 'S')),
    bill_number INTEGER NOT NULL,
    bill_type VARCHAR(10) NOT NULL CHECK (bill_type IN ('HR', 'S', 'HJRES', 'SJRES', 'HCONRES', 'SCONRES', 'HRES', 'SRES')),
    PRIMARY KEY (congress_number, session_number, origin_chamber_code, bill_number, bill_type),
    
    -- Basic Bill Information
    title TEXT NOT NULL,
    introduced_date DATE NOT NULL,
    update_date TIMESTAMP WITH TIME ZONE NOT NULL,
    congress_gov_url TEXT,
    policy_area_name VARCHAR(255),
    
    -- Latest Action
    latest_action_date DATE,
    latest_action_text TEXT,
    latest_action_code INTEGER,
    latest_action_type VARCHAR(100),
    
    -- Sponsor Information
    sponsor_name VARCHAR(255),
    sponsor_state CHAR(2),
    sponsor_party VARCHAR(50),
    sponsor_district INTEGER,
    sponsor_by_request BOOLEAN,
    
    -- Counts with Update Tracking
    cosponsor_current_count INTEGER,
    cosponsor_withdrawn_count INTEGER,
    cosponsor_count_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- URLs
    pdf_url TEXT,
    text_url TEXT
)
-- Row level security is enabled on this table.