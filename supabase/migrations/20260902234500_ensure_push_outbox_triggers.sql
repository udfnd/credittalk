-- Keep every supported content source wired to the durable push outbox.
-- Existing databases already had most of these triggers, but `events` was
-- missing and a fresh database could otherwise depend on untracked dashboard
-- state. Recreating them is transactional and prevents duplicate triggers.

drop trigger if exists on_new_arrest_news on public.arrest_news;
create trigger on_new_arrest_news
after insert on public.arrest_news
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_community_post on public.community_posts;
create trigger on_new_community_post
after insert on public.community_posts
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_incident_photo on public.incident_photos;
create trigger on_new_incident_photo
after insert on public.incident_photos
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_crime_case on public.new_crime_cases;
create trigger on_new_crime_case
after insert on public.new_crime_cases
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_notice on public.notices;
create trigger on_new_notice
after insert on public.notices
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_review on public.reviews;
create trigger on_new_review
after insert on public.reviews
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_event on public.events;
create trigger on_new_event
after insert on public.events
for each row execute function public.handle_new_post_notification();

drop trigger if exists on_new_comment_notification on public.comments;
create trigger on_new_comment_notification
after insert on public.comments
for each row execute function public.handle_new_comment_notification();
