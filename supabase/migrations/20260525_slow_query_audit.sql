create index if not exists psa_gradings_user_grade_idx
  on psa_gradings(user_id, grade);

create index if not exists psa_gradings_grade_idx
  on psa_gradings(grade);

create index if not exists sabotage_logs_attacker_success_idx
  on sabotage_logs(attacker_id, success);

create index if not exists sabotage_logs_victim_success_idx
  on sabotage_logs(victim_id, success);

create index if not exists sabotage_logs_attacker_idx
  on sabotage_logs(attacker_id);

create index if not exists showcase_cards_grading_idx
  on showcase_cards(grading_id);

create index if not exists user_showcases_user_id_idx
  on user_showcases(user_id);

create index if not exists card_ownership_user_card_idx
  on card_ownership(user_id, card_id);

create index if not exists pulls_user_pulled_idx
  on pulls(user_id, pulled_at desc);

create index if not exists gifts_to_status_idx
  on gifts(to_user_id, status);

create index if not exists gifts_from_status_idx
  on gifts(from_user_id, status);

create index if not exists users_user_id_lower_idx
  on users(lower(user_id));

create index if not exists users_pcl10_wins_idx
  on users(pcl_10_wins desc);

create index if not exists users_showcase_rank_pts_idx
  on users(showcase_rank_pts desc);

analyze users;
analyze psa_gradings;
analyze showcase_cards;
analyze user_showcases;
analyze sabotage_logs;
analyze card_ownership;
analyze gifts;
analyze pulls;
analyze pack_opens;

notify pgrst, 'reload schema';
