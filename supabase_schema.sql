-- Enable PostGIS if you want to use advanced GIS features later
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- Create farmers table
CREATE TABLE IF NOT EXISTS public.farmers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    avatar_url TEXT,
    phone_number TEXT,
    land_area NUMERIC,
    crop_type TEXT,
    crop_duration TEXT,
    weather_data TEXT,
    last_weather_fetch TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create farms table for GIS data
CREATE TABLE IF NOT EXISTS public.farms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    boundary JSONB NOT NULL, -- Storing array of {latitude: number, longitude: number}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(farmer_id)
);

-- Ensure RLS is configured to allow our operations
-- For this setup, we'll allow all actions for now. 
-- In production, you would restrict this to authenticated users.

ALTER TABLE public.farmers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;

-- Allow anonymous access for the app (Replace with authenticated-only in production)
CREATE POLICY "Allow all for anonymous" ON public.farmers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anonymous" ON public.farms FOR ALL USING (true) WITH CHECK (true);

-- Storage Setup for Avatars
-- Note: Buckets are typically created via the Supabase UI/Dashboard, 
-- but these policies ensure the app can interact with it.

-- 1. Create the 'avatars' bucket (if not exists via SQL)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage Policies for 'avatars' bucket
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars');
CREATE POLICY "Public Update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars');
CREATE POLICY "Public Delete" ON storage.objects FOR DELETE USING (bucket_id = 'avatars');

-- Create updates table for news and marketing
CREATE TABLE IF NOT EXISTS public.updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    category TEXT DEFAULT 'Product', -- e.g., 'Product', 'Alert', 'Education'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anonymous" ON public.updates FOR ALL USING (true) WITH CHECK (true);

-- Create profiles table for RBAC
CREATE TYPE public.user_role AS ENUM ('superadmin', 'expert', 'staff');

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role user_role DEFAULT 'staff',
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can edit their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Secure the updates table to only Experts and Superadmins for insertion
DROP POLICY IF EXISTS "Allow all for anonymous" ON public.updates;
CREATE POLICY "Everyone can view updates" ON public.updates FOR SELECT USING (true);
CREATE POLICY "Experts and Admins can create updates" ON public.updates 
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('superadmin', 'expert')
    )
);

-- Add tracking to farmers table
ALTER TABLE public.farmers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Policy to allow staff to see who created what
CREATE POLICY "See registration source" ON public.profiles FOR SELECT USING (true);

-- Ensure farmers can be filtered by creator
CREATE POLICY "Staff can view all farmers" ON public.farmers FOR SELECT USING (true);

-- 🏗️ Extension: Activity Tables for Farmer Portal & Staff Sync

-- 1. Field Notes
CREATE TABLE IF NOT EXISTS public.field_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    image_uri TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.field_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for field_notes" ON public.field_notes FOR ALL USING (true) WITH CHECK (true);

-- 2. Soil Health Records
CREATE TABLE IF NOT EXISTS public.soil_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    ph NUMERIC,
    nitrogen NUMERIC,
    phosphorus NUMERIC,
    potassium NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.soil_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for soil_health" ON public.soil_health FOR ALL USING (true) WITH CHECK (true);

-- 3. Visit Logs
CREATE TABLE IF NOT EXISTS public.visit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES auth.users(id),
    visit_date TIMESTAMPTZ DEFAULT NOW(),
    purpose TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for visit_logs" ON public.visit_logs FOR ALL USING (true) WITH CHECK (true);

-- 4. Treatment Logs (Input Applications)
CREATE TABLE IF NOT EXISTS public.treatment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity TEXT,
    application_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.treatment_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for treatment_logs" ON public.treatment_logs FOR ALL USING (true) WITH CHECK (true);

-- 5. Schedules
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'irrigation', 'spray', etc.
    title TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    frequency TEXT DEFAULT 'daily',
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for schedules" ON public.schedules FOR ALL USING (true) WITH CHECK (true);

-- 6. Prescriptions (Expert advice from staff)
CREATE TABLE IF NOT EXISTS public.prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    prescription_text TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for prescriptions" ON public.prescriptions FOR ALL USING (true) WITH CHECK (true);

-- 7. Visit Requests (From Farmers to Staff)
CREATE TABLE IF NOT EXISTS public.visit_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id UUID NOT NULL REFERENCES public.farmers(id) ON DELETE CASCADE,
    request_text TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'scheduled', 'completed'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all public for visit_requests" ON public.visit_requests FOR ALL USING (true) WITH CHECK (true);
