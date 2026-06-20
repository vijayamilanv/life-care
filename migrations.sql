-- Repeatable Database Schema Setup Script
-- Drop tables in reverse order of dependency
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS emergency_requests CASCADE;
DROP TABLE IF EXISTS driver_locations CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop existing types if they exist
DROP TYPE IF EXISTS request_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Create Types
CREATE TYPE user_role AS ENUM ('user', 'driver', 'ecc');
CREATE TYPE request_status AS ENUM ('pending', 'accepted', 'arrived', 'completed', 'cancelled');

-- Create Tables
-- 1. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    role user_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Drivers Table
CREATE TABLE drivers (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_number VARCHAR(50) UNIQUE NOT NULL,
    ambulance_type VARCHAR(50) NOT NULL,
    is_available BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Driver Locations Table (Stores latest location coordinates)
CREATE TABLE driver_locations (
    driver_id INTEGER PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
    latitude DECIMAL(9, 6) NOT NULL,
    longitude DECIMAL(9, 6) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Emergency Requests Table
CREATE TABLE emergency_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
    user_latitude DECIMAL(9, 6) NOT NULL,
    user_longitude DECIMAL(9, 6) NOT NULL,
    status request_status DEFAULT 'pending',
    response_time INTEGER, -- In seconds (time taken from request to driver acceptance)
    arrival_time TIMESTAMP WITH TIME ZONE,
    completion_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Notifications Table
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Activity Logs Table
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performant lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_drivers_availability ON drivers(is_available);
CREATE INDEX idx_emergency_requests_status ON emergency_requests(status);
CREATE INDEX idx_emergency_requests_user ON emergency_requests(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;
