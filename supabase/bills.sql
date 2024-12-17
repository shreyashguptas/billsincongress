-- Create bills table
create table if not exists bills (
  id text primary key,
  title text not null,
  congress_number integer,
  bill_type text,
  bill_number integer,
  sponsor_name text,
  sponsor_state text,
  sponsor_party text,
  sponsor_bioguide_id text,
  committee_count integer,
  latest_action_text text,
  latest_action_date text,
  update_date text,
  status text,
  progress numeric(5,2),
  summary text,
  tags text[],
  ai_summary text,
  last_updated timestamp with time zone,
  vote_count jsonb,
  origin_chamber text,
  origin_chamber_code char(1),
  congress_gov_url text,
  status_history jsonb default '[]'::jsonb,
  last_status_change timestamp with time zone,
  introduced_date text,
  constitutional_authority_text text,
  official_title text,
  short_title text,
  cosponsors_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint valid_progress_range check (progress >= 0 and progress <= 100)
);

-- Create indexes for faster queries
create index if not exists bills_last_updated_idx on bills(last_updated);
create index if not exists bills_congress_number_idx on bills(congress_number);
create index if not exists bills_bill_type_idx on bills(bill_type);
create index if not exists bills_bill_number_idx on bills(bill_number);
create index if not exists bills_origin_chamber_idx on bills(origin_chamber);
create index if not exists bills_status_idx on bills(status);

-- Enable Row Level Security (RLS)
alter table bills enable row level security;

-- Create policies for all operations
create policy "Allow public read access"
  on bills for select
  to public
  using (true);

create policy "Allow public insert access"
  on bills for insert
  to public
  with check (true);

create policy "Allow public update access"
  on bills for update
  to public
  using (true)
  with check (true);

create policy "Allow public delete access"
  on bills for delete
  to public
  using (true);