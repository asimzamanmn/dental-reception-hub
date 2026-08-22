# Clinic AI Connect

Prompt

Build a modern, premium SaaS admin dashboard for an AI-powered Instagram Dental Receptionist. The design should be clean, responsive, and minimal, with a polished UI similar to Linear, Vercel, or Supabase. Use cards, charts, and modern tables with dark/light mode, loading skeletons, search, filters, confirmation dialogs, and toast notifications.

Only implement the following features using the existing database schema.

Dashboard

Display analytics from the current database:

 Total Customers

 Total Conversations

 Active Conversations

 Messages Today

 Pending Booking Requests

 Confirmed Appointments

 AI Interactions Today

 Average AI Response Time

 Recent Conversations

 Recent Booking Requests

Include charts for:

 Conversations per day

 Bookings per day

 Messages per day

Clinic Settings

Use the settings table.

Allow viewing and editing:

 Clinic Name

 WhatsApp Number

 Booking Provider

 Calendly URL

 Booking Window

 Session Timeout

 Message Retention

 Intro Message

 Emergency Message

Services

Use the services table.

Provide full CRUD:

 Add

 Edit

 Delete

 Activate/Deactivate

Fields:

 Name

 Description

 Category

 Duration

 Price From

 Price To

 Booking Mode

 Display Order

Knowledge Base

Use the knowledge table.

Provide full CRUD with:

 Search

 Category Filter

 Tags

 Priority

 Active/Approved Toggle

Editable fields:

 Title

 Category

 Tags

 Content

 Priority

Doctors

Use:

doctors

doctor_availability

Allow:

 Add/Edit/Delete Doctor

 Manage weekly availability

 Activate/Deactivate

Test Accounts

Use instagram_test_accounts.

Allow:

 View test accounts

 Add test account

 Remove test account

 Enable/Disable test account

Analytics

Read-only analytics using current database tables:

 Customers

 Conversations

 Messages

 Booking Requests

 Appointments

 AI Interactions

No new database schema should be created. Use only the existing tables and relationships. Build production-quality UI components and keep the dashboard minimal, fast, and easy for clinic staff to use.
current schema
-- WARNING: This schema is for context only and is not meant to be run.

-- Table order and constraints may not be valid for execution.

CREATE TABLE public.settings (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  clinic_name text NOT NULL,

  whatsapp_number text,

  booking_provider text DEFAULT 'MANUAL'::text,

  calendly_url text,

  booking_manual_window_days integer DEFAULT 14,

  session_timeout_hours integer DEFAULT 24,

  message_retention_days integer DEFAULT 30,

  intro_message text,

  emergency_message text,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT settings_pkey PRIMARY KEY (id)

);

CREATE TABLE public.customers (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  instagram_user_id text NOT NULL UNIQUE,

  instagram_username text,

  display_name text,

  phone text,

  preferred_language text,

  is_test_account boolean DEFAULT false,

  first_seen_at timestamp with time zone DEFAULT now(),

  last_seen_at timestamp with time zone DEFAULT now(),

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT customers_pkey PRIMARY KEY (id)

);

CREATE TABLE public.conversations (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  customer_id uuid,

  status USER-DEFINED DEFAULT 'ACTIVE'::conversation_status,

  lead_stage USER-DEFINED DEFAULT 'NEW'::lead_stage,

  booking_state USER-DEFINED DEFAULT 'NONE'::booking_state,

  last_intent text,

  summary text,

  started_at timestamp with time zone DEFAULT now(),

  last_activity_at timestamp with time zone DEFAULT now(),

  closed_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  last_ai_reply timestamp with time zone,

  pending_booking jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT conversations_pkey PRIMARY KEY (id),

  CONSTRAINT conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id)

);

CREATE TABLE public.messages (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  conversation_id uuid,

  direction USER-DEFINED NOT NULL,

  message_type USER-DEFINED DEFAULT 'TEXT'::message_type,

  meta_message_id text UNIQUE,

  raw_text text,

  normalized_text text,

  transcript text,

  media_url text,

  batch_id uuid,

  ai_processed boolean DEFAULT false,

  created_at timestamp with time zone DEFAULT now(),

  message_group_id uuid,

  conversation_batch_id uuid,

  CONSTRAINT messages_pkey PRIMARY KEY (id),

  CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),

  CONSTRAINT messages_conversation_batch_id_fkey FOREIGN KEY (conversation_batch_id) REFERENCES public.conversation_batches(id)

);

CREATE TABLE public.services (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  name text NOT NULL UNIQUE,

  description text,

  category text,

  duration_minutes integer DEFAULT 30,

  price_from numeric,

  price_to numeric,

  currency character DEFAULT 'INR'::bpchar,

  booking_mode USER-DEFINED DEFAULT 'STAFF'::booking_mode,

  active boolean DEFAULT true,

  display_order integer DEFAULT 0,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT services_pkey PRIMARY KEY (id)

);

CREATE TABLE public.knowledge (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  title text NOT NULL,

  category text NOT NULL,

  tags ARRAY DEFAULT '{}'::text[],

  content text NOT NULL,

  priority integer DEFAULT 50,

  approved boolean DEFAULT true,

  active boolean DEFAULT true,

  last_reviewed_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT knowledge_pkey PRIMARY KEY (id)

);

CREATE TABLE public.doctors (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  name text NOT NULL,

  specialization text,

  slot_duration_minutes integer DEFAULT 30,

  active boolean DEFAULT true,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT doctors_pkey PRIMARY KEY (id)

);

CREATE TABLE public.doctor_availability (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  doctor_id uuid NOT NULL,

  weekday smallint NOT NULL CHECK (weekday >= 0 AND weekday <= 6),

  start_time time without time zone NOT NULL,

  end_time time without time zone NOT NULL,

  active boolean DEFAULT true,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT doctor_availability_pkey PRIMARY KEY (id),

  CONSTRAINT doctor_availability_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)

);

CREATE TABLE public.booking_requests (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  customer_id uuid NOT NULL,

  conversation_id uuid NOT NULL,

  service_id uuid,

  status USER-DEFINED NOT NULL DEFAULT 'PENDING_STAFF'::booking_request_status,

  communication_status USER-DEFINED NOT NULL DEFAULT 'NONE'::communication_status,

  preferred_date date,

  preferred_month date,

  preferred_time_text text,

  urgency smallint DEFAULT 50 CHECK (urgency >= 1 AND urgency <= 100),

  ai_summary text,

  patient_notes text,

  reviewed_by text,

  reviewed_at timestamp with time zone,

  confirmed_at timestamp with time zone,

  created_by_ai boolean DEFAULT true,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  priority integer DEFAULT 50,

  CONSTRAINT booking_requests_pkey PRIMARY KEY (id),

  CONSTRAINT booking_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),

  CONSTRAINT booking_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),

  CONSTRAINT booking_requests_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id)

);

CREATE TABLE public.appointments (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  booking_request_id uuid NOT NULL,

  doctor_id uuid,

  appointment_date date NOT NULL,

  start_time time without time zone NOT NULL,

  end_time time without time zone NOT NULL,

  status USER-DEFINED DEFAULT 'SCHEDULED'::appointment_status,

  notes text,

  created_at timestamp with time zone DEFAULT now(),

  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT appointments_pkey PRIMARY KEY (id),

  CONSTRAINT appointments_booking_request_id_fkey FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id),

  CONSTRAINT appointments_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)

);

CREATE TABLE public.booking_timeline (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  booking_request_id uuid NOT NULL,

  event_name text NOT NULL,

  event_note text,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT booking_timeline_pkey PRIMARY KEY (id),

  CONSTRAINT booking_timeline_booking_request_id_fkey FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id)

);

CREATE TABLE public.inbound_events (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  meta_event_id text NOT NULL UNIQUE,

  meta_message_id text,

  instagram_user_id text,

  payload jsonb,

  processed boolean DEFAULT false,

  received_at timestamp with time zone DEFAULT now(),

  CONSTRAINT inbound_events_pkey PRIMARY KEY (id)

);

CREATE TABLE public.outbound_messages (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  conversation_id uuid,

  booking_request_id uuid,

  recipient_instagram_id text NOT NULL,

  message_text text NOT NULL,

  status USER-DEFINED DEFAULT 'PENDING'::outbound_status,

  retry_count integer DEFAULT 0,

  meta_message_id text,

  sent_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT outbound_messages_pkey PRIMARY KEY (id),

  CONSTRAINT outbound_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id),

  CONSTRAINT outbound_messages_booking_request_id_fkey FOREIGN KEY (booking_request_id) REFERENCES public.booking_requests(id)

);

CREATE TABLE public.ai_interactions (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  conversation_id uuid NOT NULL,

  model text NOT NULL,

  prompt_version text,

  action text,

  input_tokens integer,

  output_tokens integer,

  latency_ms integer,

  created_at timestamp with time zone DEFAULT now(),

  estimated_cost numeric,

  CONSTRAINT ai_interactions_pkey PRIMARY KEY (id),

  CONSTRAINT ai_interactions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)

);

CREATE TABLE public.conversation_summaries (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  conversation_id uuid,

  summary text,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT conversation_summaries_pkey PRIMARY KEY (id),

  CONSTRAINT conversation_summaries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)

);

CREATE TABLE public.instagram_test_accounts (

  instagram_user_id text NOT NULL,

  name text,

  active boolean DEFAULT true,

  created_at timestamp with time zone DEFAULT now(),

  CONSTRAINT instagram_test_accounts_pkey PRIMARY KEY (instagram_user_id)

);

CREATE TABLE public.conversation_batches (

  id uuid NOT NULL DEFAULT gen_random_uuid(),

  conversation_id uuid NOT NULL,

  status text NOT NULL DEFAULT 'CREATED'::text CHECK (status = ANY (ARRAY['CREATED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'FAILED'::text])),

  merged_text text,

  message_count integer DEFAULT 0,

  started_at timestamp with time zone DEFAULT now(),

  processed_at timestamp with time zone,

  CONSTRAINT conversation_batches_pkey PRIMARY KEY (id),

  CONSTRAINT conversation_batches_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)

);

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/516dec1d-b766-4121-b4c5-43d9cac8c3c2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
