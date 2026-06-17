-- Resilience Schema Alterations Script
-- 1. Update users table with verification columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

-- 2. Update drivers table with last-seen trackers
ALTER TABLE drivers 
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_latitude DECIMAL(9, 6),
ADD COLUMN IF NOT EXISTS last_longitude DECIMAL(9, 6);

-- 3. Update emergency_requests table with UUID and escalation trackers
ALTER TABLE emergency_requests 
ADD COLUMN IF NOT EXISTS request_uuid UUID UNIQUE,
ADD COLUMN IF NOT EXISTS last_sms_sent_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS voice_called_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS escalation_step INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE;

-- Create index to optimize scheduler sweeps on active pending dispatches
CREATE INDEX IF NOT EXISTS idx_requests_escalation_status 
ON emergency_requests(status, escalation_step) 
WHERE status = 'pending';
