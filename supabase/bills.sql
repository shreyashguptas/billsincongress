-- Create bills table
create table if not exists bills (
  id text primary key,
  title text not null,
  sponsor text,
  introduced text,
  status text,
  progress integer,
  summary text,
  tags text[],
  ai_summary text,
  last_updated text,
  vote_count jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create index for faster queries
create index if not exists bills_last_updated_idx on bills(last_updated);

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