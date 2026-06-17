-- National Smart Emergency Ambulance Dispatch & Response System Schema Alterations

-- 1. Ambulances Table
CREATE TABLE IF NOT EXISTS ambulances (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    vehicle_plate VARCHAR(50) UNIQUE NOT NULL,
    ambulance_type VARCHAR(50) NOT NULL, -- ALS (Advanced Life Support), BLS (Basic Life Support), Cardiac, Pediatric
    status VARCHAR(50) DEFAULT 'active', -- active, maintenance, inactive
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Driver Availability Logs
CREATE TABLE IF NOT EXISTS availability_logs (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE CASCADE,
    is_available BOOLEAN NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Request Status Transition History
CREATE TABLE IF NOT EXISTS request_status_history (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES emergency_requests(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Hospitals Table
CREATE TABLE IF NOT EXISTS hospitals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Hospital Capacity Tracker
CREATE TABLE IF NOT EXISTS hospital_capacity (
    hospital_id INTEGER PRIMARY KEY REFERENCES hospitals(id) ON DELETE CASCADE,
    total_beds INTEGER NOT NULL DEFAULT 50,
    available_beds INTEGER NOT NULL DEFAULT 10,
    total_icu_beds INTEGER NOT NULL DEFAULT 10,
    available_icu_beds INTEGER NOT NULL DEFAULT 2,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Hospital Alerts & Preparations
CREATE TABLE IF NOT EXISTS hospital_alerts (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER REFERENCES hospitals(id) ON DELETE CASCADE,
    request_id INTEGER REFERENCES emergency_requests(id) ON DELETE CASCADE,
    eta_minutes INTEGER,
    severity VARCHAR(50) DEFAULT 'critical',
    status VARCHAR(50) DEFAULT 'pending', -- pending, preparing, ready
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Police Coordination Alerts
CREATE TABLE IF NOT EXISTS police_alerts (
    id SERIAL PRIMARY KEY,
    request_id INTEGER REFERENCES emergency_requests(id) ON DELETE CASCADE,
    badge_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'dispatched', -- dispatched, on_scene, resolved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. SMS Gateway Audit Logs
CREATE TABLE IF NOT EXISTS sms_logs (
    id SERIAL PRIMARY KEY,
    recipient_phone VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL, -- success, failed
    sid VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Automated Voice Call Audit Logs
CREATE TABLE IF NOT EXISTS call_logs (
    id SERIAL PRIMARY KEY,
    recipient_phone VARCHAR(20) NOT NULL,
    voice_content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL, -- success, failed
    sid VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Indexes for Fast Proximity and Audit Lookups
CREATE INDEX IF NOT EXISTS idx_ambulances_driver ON ambulances(driver_id);
CREATE INDEX IF NOT EXISTS idx_hospital_capacity_avail ON hospital_capacity(available_icu_beds, available_beds);
CREATE INDEX IF NOT EXISTS idx_police_alerts_request ON police_alerts(request_id);
CREATE INDEX IF NOT EXISTS idx_hospital_alerts_request ON hospital_alerts(request_id);
CREATE INDEX IF NOT EXISTS idx_status_history_request ON request_status_history(request_id);
