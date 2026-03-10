PRAGMA foreign_keys = ON;

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_username ON users(username);

CREATE TABLE user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  permission_key TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);

CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_token TEXT NOT NULL UNIQUE,
  acting_as_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);

CREATE TABLE impersonation_audit (
  id TEXT PRIMARY KEY,
  office_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  site_code TEXT NOT NULL UNIQUE,
  site_name TEXT NOT NULL,
  site_name_normalized TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  post_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sites_site_code ON sites(site_code);
CREATE INDEX idx_sites_site_name_norm ON sites(site_name_normalized);
CREATE INDEX idx_sites_client_id ON sites(client_id);

CREATE TABLE site_mileage (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES sites(id),
  miles REAL NOT NULL,
  default_travel_minutes INTEGER,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_site_mileage_site_id ON site_mileage(site_id);

CREATE TABLE engineers (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE REFERENCES users(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  engineer_name_normalized TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_engineers_user_id ON engineers(user_id);
CREATE INDEX idx_engineers_name_norm ON engineers(engineer_name_normalized);

CREATE TABLE engineer_rates (
  id TEXT PRIMARY KEY,
  engineer_id TEXT NOT NULL REFERENCES engineers(id),
  hourly_rate REAL NOT NULL,
  fuel_rate REAL,
  effective_from TEXT NOT NULL,
  effective_to TEXT
);
CREATE INDEX idx_engineer_rates_engineer_id ON engineer_rates(engineer_id);

CREATE TABLE client_rates (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  labour_rate REAL,
  fuel_rate REAL,
  effective_from TEXT NOT NULL,
  effective_to TEXT
);
CREATE INDEX idx_client_rates_client_id ON client_rates(client_id);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  helpdesk_ref TEXT,
  site_id TEXT REFERENCES sites(id),
  client_id TEXT REFERENCES clients(id),
  site_code TEXT,
  priority TEXT NOT NULL,
  priority_rank INTEGER DEFAULT 2,
  current_status TEXT NOT NULL,
  raised_date TEXT,
  scheduled_date TEXT,
  sla_target_at TEXT,
  travel_started_at TEXT,
  on_site_at TEXT,
  in_progress_at TEXT,
  completed_at TEXT,
  closed_at TEXT,
  completion_notes TEXT,
  customer_signature_name TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_jobs_helpdesk_ref ON jobs(helpdesk_ref);
CREATE INDEX idx_jobs_site_code ON jobs(site_code);
CREATE INDEX idx_jobs_status ON jobs(current_status);
CREATE INDEX idx_jobs_priority_rank ON jobs(priority_rank);
CREATE INDEX idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX idx_jobs_raised_date ON jobs(raised_date);
CREATE INDEX idx_jobs_updated_at ON jobs(updated_at);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_jobs_site_id ON jobs(site_id);

CREATE TABLE job_engineers (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  engineer_id TEXT REFERENCES engineers(id),
  engineer_user_id TEXT REFERENCES users(id),
  allocated_at TEXT NOT NULL,
  allocated_by_user_id TEXT NOT NULL REFERENCES users(id),
  released_at TEXT
);
CREATE INDEX idx_job_engineers_job_id ON job_engineers(job_id);
CREATE INDEX idx_job_engineers_engineer_id_date ON job_engineers(engineer_id, allocated_at);

CREATE TABLE job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  event_type TEXT NOT NULL,
  details TEXT,
  actor_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_job_events_job_id ON job_events(job_id);
CREATE INDEX idx_job_events_changed_at ON job_events(created_at);

CREATE TABLE job_status_history (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  changed_by_user_id TEXT REFERENCES users(id),
  changed_at TEXT NOT NULL
);
CREATE INDEX idx_status_history_job ON job_status_history(job_id);
CREATE INDEX idx_status_history_changed_at ON job_status_history(changed_at);

CREATE TABLE hold_requests (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  decision_note TEXT,
  reviewed_by_user_id TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX idx_hold_requests_status_job ON hold_requests(status, job_id);

CREATE TABLE job_materials (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL,
  supplier TEXT,
  notes TEXT,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_materials_job_id ON job_materials(job_id);

CREATE TABLE job_completion_checks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  completion_notes_ok INTEGER NOT NULL,
  signature_ok INTEGER NOT NULL,
  materials_ok INTEGER NOT NULL,
  no_materials_confirmation_text TEXT,
  confirmed_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_completion_checks_job ON job_completion_checks(job_id);

CREATE TABLE job_files (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  file_kind TEXT NOT NULL,
  original_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_job_files_job_id ON job_files(job_id);

CREATE TABLE job_costing (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id),
  labour_minutes INTEGER,
  fuel_miles REAL,
  actual_labour REAL,
  actual_fuel REAL,
  actual_total REAL,
  client_labour REAL,
  client_fuel REAL,
  client_total REAL,
  manual_adjustments REAL,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE scheduler_entries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  engineer_id TEXT NOT NULL REFERENCES engineers(id),
  scheduled_date TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_scheduler_engineer_date ON scheduler_entries(engineer_id, scheduled_date);
CREATE INDEX idx_scheduler_job_id ON scheduler_entries(job_id);

CREATE TABLE job_export_preferences (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  export_mode TEXT NOT NULL,
  include_core INTEGER DEFAULT 1,
  include_site INTEGER DEFAULT 1,
  include_engineers INTEGER DEFAULT 1,
  include_timestamps INTEGER DEFAULT 1,
  include_status_history INTEGER DEFAULT 1,
  include_notes INTEGER DEFAULT 1,
  include_event_history INTEGER DEFAULT 1,
  include_sla INTEGER DEFAULT 1,
  include_actual_cost INTEGER DEFAULT 0,
  include_client_cost INTEGER DEFAULT 0,
  include_fuel_cost INTEGER DEFAULT 0,
  include_labour_cost INTEGER DEFAULT 0,
  include_materials INTEGER DEFAULT 1,
  include_images INTEGER DEFAULT 1,
  include_signature INTEGER DEFAULT 1,
  include_attachments INTEGER DEFAULT 1,
  export_notes TEXT,
  updated_by_user_id TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
