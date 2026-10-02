-- Lets the database call HTTP endpoints (used for smoke-testing the edge functions).
create extension if not exists pg_net with schema extensions;
