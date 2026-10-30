-- Local development only. Production credentials must come from a secret manager.
CREATE ROLE campusconnect_app LOGIN PASSWORD 'campusconnect_local_only' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE campusconnect TO campusconnect_app;
GRANT USAGE ON SCHEMA public TO campusconnect_app;
