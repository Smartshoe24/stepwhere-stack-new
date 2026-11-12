create table banners
(
    id         int unsigned auto_increment
        primary key,
    slug       longtext                      null,
    title      varchar(255)                  null,
    image      varchar(255)                  null,
    status     varchar(255) default 'active' null,
    created_at timestamp                     null,
    updated_at timestamp                     null
)
    collate = utf8mb4_unicode_ci;

create table categories
(
    id         int unsigned auto_increment
        primary key,
    slug       longtext                      null,
    title      varchar(255)                  null,
    image      varchar(255)                  null,
    status     varchar(255) default 'active' null,
    created_at timestamp                     null,
    updated_at timestamp                     null
)
    collate = utf8mb4_unicode_ci;

create table cms
(
    id          int unsigned auto_increment
        primary key,
    slug        longtext                      null,
    title       varchar(255)                  null,
    description longtext                      null,
    status      varchar(255) default 'active' null,
    created_at  timestamp                     null,
    updated_at  timestamp                     null
)
    collate = utf8mb4_unicode_ci;

create table columns_priv
(
    Host        char(255) charset ascii                                          default ''                not null,
    Db          char(64)                                                         default ''                not null,
    User        char(32)                                                         default ''                not null,
    Table_name  char(64)                                                         default ''                not null,
    Column_name char(64)                                                         default ''                not null,
    Timestamp   timestamp                                                        default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    Column_priv set ('Select', 'Insert', 'Update', 'References') charset utf8mb3 default ''                not null,
    primary key (Host, User, Db, Table_name, Column_name)
)
    comment 'Column privileges' collate = utf8mb3_bin
                                row_format = DYNAMIC
                                stats_persistent = 0;

create table component
(
    component_id       int unsigned auto_increment
        primary key,
    component_group_id int unsigned not null,
    component_urn      text         not null
)
    comment 'Components' charset = utf8mb3
                         row_format = DYNAMIC;

create table course_assign_users
(
    id              int unsigned auto_increment
        primary key,
    video_course_id int unsigned not null,
    user_id         int unsigned not null,
    slug            varchar(255) null,
    start_date      date         null,
    end_date        date         null,
    created_at      timestamp    null,
    updated_at      timestamp    null
)
    collate = utf8mb4_unicode_ci;

create table db
(
    Host                  char(255) charset ascii         default ''  not null,
    Db                    char(64)                        default ''  not null,
    User                  char(32)                        default ''  not null,
    Select_priv           enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Insert_priv           enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Update_priv           enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Delete_priv           enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Create_priv           enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Drop_priv             enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Grant_priv            enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    References_priv       enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Index_priv            enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Alter_priv            enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Create_tmp_table_priv enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Lock_tables_priv      enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Create_view_priv      enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Show_view_priv        enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Create_routine_priv   enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Alter_routine_priv    enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Execute_priv          enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Event_priv            enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    Trigger_priv          enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    primary key (Host, User, Db)
)
    comment 'Database privileges' collate = utf8mb3_bin
                                  row_format = DYNAMIC
                                  stats_persistent = 0;

create index User
    on db (User);

create table default_roles
(
    HOST              char(255) charset ascii default ''  not null,
    USER              char(32)                default ''  not null,
    DEFAULT_ROLE_HOST char(255) charset ascii default '%' not null,
    DEFAULT_ROLE_USER char(32)                default ''  not null,
    primary key (HOST, USER, DEFAULT_ROLE_HOST, DEFAULT_ROLE_USER)
)
    comment 'Default roles' collate = utf8mb3_bin
                            row_format = DYNAMIC
                            stats_persistent = 0;

create table device_ids
(
    id         int auto_increment
        primary key,
    device     varchar(100)                          not null,
    status     varchar(50) default 'active'          not null,
    slug       varchar(100)                          not null,
    created_at timestamp   default CURRENT_TIMESTAMP not null,
    updated_at timestamp   default CURRENT_TIMESTAMP not null
);

create table engine_cost
(
    engine_name   varchar(64)                         not null,
    device_type   int                                 not null,
    cost_name     varchar(64)                         not null,
    cost_value    float                               null,
    last_update   timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    comment       varchar(1024)                       null,
    default_value float as ((case `cost_name`
                                 when _utf8mb4'io_block_read_cost' then 1.0
                                 when _utf8mb4'memory_block_read_cost' then 0.25
                                 else NULL end)),
    primary key (cost_name, engine_name, device_type)
)
    charset = utf8mb3
    row_format = DYNAMIC
    stats_persistent = 0;

create table failed_jobs
(
    id         bigint unsigned auto_increment
        primary key,
    uuid       varchar(255)                        not null,
    connection text                                not null,
    queue      text                                not null,
    payload    longtext                            not null,
    exception  longtext                            not null,
    failed_at  timestamp default CURRENT_TIMESTAMP not null,
    constraint failed_jobs_uuid_unique
        unique (uuid)
)
    collate = utf8mb4_unicode_ci;

create table feed_backs
(
    id         int unsigned auto_increment
        primary key,
    slug       varchar(255) null,
    name       varchar(255) null,
    email      varchar(50)  null,
    mobile     varchar(15)  null,
    message    varchar(255) null,
    created_at timestamp    null,
    updated_at timestamp    null
)
    collate = utf8mb4_unicode_ci;

create table func
(
    name char(64)  default ''                           not null
        primary key,
    ret  tinyint   default 0                            not null,
    dl   char(128) default ''                           not null,
    type enum ('function', 'aggregate') charset utf8mb3 not null
)
    comment 'User defined functions' collate = utf8mb3_bin
                                     row_format = DYNAMIC
                                     stats_persistent = 0;

create table general_log
(
    event_time   timestamp(6) default CURRENT_TIMESTAMP(6) not null on update CURRENT_TIMESTAMP(6),
    user_host    mediumtext                                not null,
    thread_id    bigint unsigned                           not null,
    server_id    int unsigned                              not null,
    command_type varchar(64)                               not null,
    argument     mediumblob                                not null
)
    comment 'General log' engine = CSV
                          charset = utf8mb3;

create table global_grants
(
    USER              char(32)                        default ''  not null,
    HOST              char(255) charset ascii         default ''  not null,
    PRIV              char(32) charset utf8mb3        default ''  not null,
    WITH_GRANT_OPTION enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    primary key (USER, HOST, PRIV)
)
    comment 'Extended global grants' collate = utf8mb3_bin
                                     row_format = DYNAMIC
                                     stats_persistent = 0;

create table gtid_executed
(
    source_uuid    char(36) not null comment 'uuid of the source where the transaction was originally executed.',
    interval_start bigint   not null comment 'First number of interval.',
    interval_end   bigint   not null comment 'Last number of interval.',
    gtid_tag       char(32) not null comment 'GTID Tag.',
    primary key (source_uuid, gtid_tag, interval_start)
)
    row_format = DYNAMIC
    stats_persistent = 0;

create table help_category
(
    help_category_id   smallint unsigned not null
        primary key,
    name               char(64)          not null,
    parent_category_id smallint unsigned null,
    url                text              not null,
    constraint name
        unique (name)
)
    comment 'help categories' charset = utf8mb3
                              row_format = DYNAMIC
                              stats_persistent = 0;

create table help_keyword
(
    help_keyword_id int unsigned not null
        primary key,
    name            char(64)     not null,
    constraint name
        unique (name)
)
    comment 'help keywords' charset = utf8mb3
                            row_format = DYNAMIC
                            stats_persistent = 0;

create table help_relation
(
    help_topic_id   int unsigned not null,
    help_keyword_id int unsigned not null,
    primary key (help_keyword_id, help_topic_id)
)
    comment 'keyword-topic relation' charset = utf8mb3
                                     row_format = DYNAMIC
                                     stats_persistent = 0;

create table help_topic
(
    help_topic_id    int unsigned      not null
        primary key,
    name             char(64)          not null,
    help_category_id smallint unsigned not null,
    description      text              not null,
    example          text              not null,
    url              text              not null,
    constraint name
        unique (name)
)
    comment 'help topics' charset = utf8mb3
                          row_format = DYNAMIC
                          stats_persistent = 0;

create table innodb_index_stats
(
    database_name    varchar(64)                         not null,
    table_name       varchar(199)                        not null,
    index_name       varchar(64)                         not null,
    last_update      timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    stat_name        varchar(64)                         not null,
    stat_value       bigint unsigned                     not null,
    sample_size      bigint unsigned                     null,
    stat_description varchar(1024)                       not null,
    primary key (database_name, table_name, index_name, stat_name)
)
    collate = utf8mb3_bin
    row_format = DYNAMIC
    stats_persistent = 0;

create table innodb_table_stats
(
    database_name            varchar(64)                         not null,
    table_name               varchar(199)                        not null,
    last_update              timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    n_rows                   bigint unsigned                     not null,
    clustered_index_size     bigint unsigned                     not null,
    sum_of_other_index_sizes bigint unsigned                     not null,
    primary key (database_name, table_name)
)
    collate = utf8mb3_bin
    row_format = DYNAMIC
    stats_persistent = 0;

create table migrations
(
    id        int unsigned auto_increment
        primary key,
    migration varchar(255) not null,
    batch     int          not null
)
    collate = utf8mb4_unicode_ci;

create table ndb_binlog_index
(
    Position       bigint unsigned not null,
    File           varchar(255)    not null,
    epoch          bigint unsigned not null,
    inserts        int unsigned    not null,
    updates        int unsigned    not null,
    deletes        int unsigned    not null,
    schemaops      int unsigned    not null,
    orig_server_id int unsigned    not null,
    orig_epoch     bigint unsigned not null,
    gci            int unsigned    not null,
    next_position  bigint unsigned not null,
    next_file      varchar(255)    not null,
    primary key (epoch, orig_server_id, orig_epoch)
)
    charset = latin1
    row_format = DYNAMIC
    stats_persistent = 0;

create table notifications
(
    id          int unsigned auto_increment
        primary key,
    course_id   int                         default 0        not null,
    slug        varchar(255)                                 null,
    title       varchar(255)                                 null,
    logo        varchar(255)                                 null,
    description longtext                                     null,
    user_id     int                         default 0        not null,
    role        varchar(255)                default 'user'   not null,
    status      enum ('active', 'inactive') default 'active' not null,
    created_at  timestamp                                    null,
    updated_at  timestamp                                    null
)
    collate = utf8mb4_unicode_ci;

create table oauth_access_tokens
(
    id         varchar(100)    not null
        primary key,
    user_id    bigint unsigned null,
    client_id  bigint unsigned not null,
    name       varchar(255)    null,
    scopes     text            null,
    revoked    tinyint(1)      not null,
    created_at timestamp       null,
    updated_at timestamp       null,
    expires_at datetime        null
)
    collate = utf8mb4_unicode_ci;

create index oauth_access_tokens_user_id_index
    on oauth_access_tokens (user_id);

create table oauth_auth_codes
(
    id         varchar(100)    not null
        primary key,
    user_id    bigint unsigned not null,
    client_id  bigint unsigned not null,
    scopes     text            null,
    revoked    tinyint(1)      not null,
    expires_at datetime        null
)
    collate = utf8mb4_unicode_ci;

create index oauth_auth_codes_user_id_index
    on oauth_auth_codes (user_id);

create table oauth_clients
(
    id                     bigint unsigned auto_increment
        primary key,
    user_id                bigint unsigned null,
    name                   varchar(255)    not null,
    secret                 varchar(100)    null,
    provider               varchar(255)    null,
    redirect               text            not null,
    personal_access_client tinyint(1)      not null,
    password_client        tinyint(1)      not null,
    revoked                tinyint(1)      not null,
    created_at             timestamp       null,
    updated_at             timestamp       null
)
    collate = utf8mb4_unicode_ci;

create index oauth_clients_user_id_index
    on oauth_clients (user_id);

create table oauth_personal_access_clients
(
    id         bigint unsigned auto_increment
        primary key,
    client_id  bigint unsigned not null,
    created_at timestamp       null,
    updated_at timestamp       null
)
    collate = utf8mb4_unicode_ci;

create table oauth_refresh_tokens
(
    id              varchar(100) not null
        primary key,
    access_token_id varchar(100) not null,
    revoked         tinyint(1)   not null,
    expires_at      datetime     null
)
    collate = utf8mb4_unicode_ci;

create index oauth_refresh_tokens_access_token_id_index
    on oauth_refresh_tokens (access_token_id);

create table password_history
(
    Host               char(255) charset ascii default ''                   not null,
    User               char(32)                default ''                   not null,
    Password_timestamp timestamp(6)            default CURRENT_TIMESTAMP(6) not null,
    Password           text                                                 null,
    primary key (Host asc, User asc, Password_timestamp desc)
)
    comment 'Password history for user accounts' collate = utf8mb3_bin
                                                 row_format = DYNAMIC
                                                 stats_persistent = 0;

create table password_resets
(
    email      varchar(255) not null,
    token      varchar(255) not null,
    created_at timestamp    null
)
    collate = utf8mb4_unicode_ci;

create index password_resets_email_index
    on password_resets (email);

create table permissions
(
    id         bigint unsigned auto_increment
        primary key,
    name       varchar(255) not null,
    guard_name varchar(255) not null,
    created_at timestamp    null,
    updated_at timestamp    null,
    constraint permissions_name_guard_name_unique
        unique (name, guard_name)
)
    collate = utf8mb4_unicode_ci;

create table model_has_permissions
(
    permission_id bigint unsigned not null,
    model_type    varchar(255)    not null,
    model_id      bigint unsigned not null,
    primary key (permission_id, model_id, model_type),
    constraint model_has_permissions_permission_id_foreign
        foreign key (permission_id) references permissions (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;

create index model_has_permissions_model_id_model_type_index
    on model_has_permissions (model_id, model_type);

create table personal_access_tokens
(
    id             bigint unsigned auto_increment
        primary key,
    tokenable_type varchar(255)    not null,
    tokenable_id   bigint unsigned not null,
    name           varchar(255)    not null,
    token          varchar(64)     not null,
    abilities      text            null,
    last_used_at   timestamp       null,
    expires_at     timestamp       null,
    created_at     timestamp       null,
    updated_at     timestamp       null,
    constraint personal_access_tokens_token_unique
        unique (token)
)
    collate = utf8mb4_unicode_ci;

create index personal_access_tokens_tokenable_type_tokenable_id_index
    on personal_access_tokens (tokenable_type, tokenable_id);

create table plans
(
    id          int unsigned auto_increment
        primary key,
    slug        varchar(255)                  null,
    title       varchar(255)                  null,
    description longtext                      null,
    month       varchar(255)                  null,
    amount      int                           null,
    status      varchar(255) default 'active' null,
    created_at  timestamp                     null,
    updated_at  timestamp                     null
)
    collate = utf8mb4_unicode_ci;

create table plan_purchases
(
    id          int unsigned auto_increment
        primary key,
    child_id    int unsigned                null,
    plan_id     int unsigned                not null,
    slug        varchar(255)                null,
    amount      varchar(255)                null,
    order_id    varchar(255)                null,
    purchase_id varchar(255)                null,
    status      enum ('0', '1') default '0' not null,
    month       varchar(50)                 null,
    start_date  varchar(50)                 null,
    end_date    varchar(50)                 null,
    created_at  timestamp                   null,
    updated_at  timestamp                   null,
    constraint plan_purchases_plan_id_foreign
        foreign key (plan_id) references plans (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;

create index plan_purchases_child_id_foreign
    on plan_purchases (child_id);

create table plugin
(
    name varchar(64)  default '' not null
        primary key,
    dl   varchar(128) default '' not null
)
    comment 'MySQL plugins' charset = utf8mb3
                            row_format = DYNAMIC
                            stats_persistent = 0;

create table procs_priv
(
    Host         char(255) charset ascii                                   default ''                not null,
    Db           char(64)                                                  default ''                not null,
    User         char(32)                                                  default ''                not null,
    Routine_name char(64) charset utf8mb3                                  default ''                not null,
    Routine_type enum ('FUNCTION', 'PROCEDURE', 'LIBRARY')                                           not null,
    Grantor      varchar(288)                                              default ''                not null,
    Proc_priv    set ('Execute', 'Alter Routine', 'Grant') charset utf8mb3 default ''                not null,
    Timestamp    timestamp                                                 default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    primary key (Host, User, Db, Routine_name, Routine_type)
)
    comment 'Procedure privileges' collate = utf8mb3_bin
                                   row_format = DYNAMIC
                                   stats_persistent = 0;

create index Grantor
    on procs_priv (Grantor);

create table products
(
    id           int unsigned auto_increment
        primary key,
    slug         varchar(255)                  null,
    title        varchar(255)                  null,
    description  longtext                      null,
    price        varchar(255)                  null,
    offer_price  varchar(255)                  null,
    image_first  varchar(255)                  null,
    image_second varchar(255)                  null,
    image_third  varchar(255)                  null,
    image_four   varchar(255)                  null,
    image_five   varchar(255)                  null,
    link         longtext                      null,
    status       varchar(255) default 'active' null,
    created_at   timestamp                     null,
    updated_at   timestamp                     null
)
    collate = utf8mb4_unicode_ci;

create table proxies_priv
(
    Host         char(255) charset ascii default ''                not null,
    User         char(32)                default ''                not null,
    Proxied_host char(255) charset ascii default ''                not null,
    Proxied_user char(32)                default ''                not null,
    With_grant   tinyint(1)              default 0                 not null,
    Grantor      varchar(288)            default ''                not null,
    Timestamp    timestamp               default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    primary key (Host, User, Proxied_host, Proxied_user)
)
    comment 'User proxy privileges' collate = utf8mb3_bin
                                    row_format = DYNAMIC
                                    stats_persistent = 0;

create index Grantor
    on proxies_priv (Grantor);

create table replication_asynchronous_connection_failover
(
    Channel_name      char(64)                not null comment 'The replication channel name that connects source and replica.',
    Host              char(255) charset ascii not null comment 'The source hostname that the replica will attempt to switch over the replication connection to in case of a failure.',
    Port              int unsigned            not null comment 'The source port that the replica will attempt to switch over the replication connection to in case of a failure.',
    Network_namespace char(64)                not null comment 'The source network namespace that the replica will attempt to switch over the replication connection to in case of a failure. If its value is empty, connections use the default (global) namespace.',
    Weight            tinyint unsigned        not null comment 'The order in which the replica shall try to switch the connection over to when there are failures. Weight can be set to a number between 1 and 100, where 100 is the highest weight and 1 the lowest.',
    Managed_name      char(64) default ''     not null comment 'The name of the group which this server belongs to.',
    primary key (Channel_name, Host, Port, Network_namespace, Managed_name)
)
    comment 'The source configuration details' charset = utf8mb3
                                               row_format = DYNAMIC
                                               stats_persistent = 0;

create index Channel_name
    on replication_asynchronous_connection_failover (Channel_name, Managed_name);

create table replication_asynchronous_connection_failover_managed
(
    Channel_name  char(64)            not null comment 'The replication channel name that connects source and replica.',
    Managed_name  char(64) default '' not null comment 'The name of the source which needs to be managed.',
    Managed_type  char(64) default '' not null comment 'Determines the managed type.',
    Configuration json                null comment 'The data to help manage group. For Managed_type = GroupReplication, Configuration value should contain {"Primary_weight": 80, "Secondary_weight": 60}, so that it assigns weight=80 to PRIMARY of the group, and weight=60 for rest of the members in mysql.replication_asynchronous_connection_failover table.',
    primary key (Channel_name, Managed_name)
)
    comment 'The managed source configuration details' charset = utf8mb3
                                                       row_format = DYNAMIC
                                                       stats_persistent = 0;

create table replication_group_configuration_version
(
    name    char(255) charset ascii not null comment 'The configuration name.'
        primary key,
    version bigint unsigned         not null comment 'The version of the configuration name.'
)
    comment 'The group configuration version.' row_format = DYNAMIC
                                               stats_persistent = 0;

create table replication_group_member_actions
(
    name           char(255) charset ascii not null comment 'The action name.',
    event          char(64) charset ascii  not null comment 'The event that will trigger the action.',
    enabled        tinyint(1)              not null comment 'Whether the action is enabled.',
    type           char(64) charset ascii  not null comment 'The action type.',
    priority       tinyint unsigned        not null comment 'The order on which the action will be run, value between 1 and 100, lower values first.',
    error_handling char(64) charset ascii  not null comment 'On errors during the action will be handled: IGNORE, CRITICAL.',
    primary key (name, event)
)
    comment 'The member actions configuration.' row_format = DYNAMIC
                                                stats_persistent = 0;

create index event
    on replication_group_member_actions (event);

create table role_edges
(
    FROM_HOST         char(255) charset ascii         default ''  not null,
    FROM_USER         char(32)                        default ''  not null,
    TO_HOST           char(255) charset ascii         default ''  not null,
    TO_USER           char(32)                        default ''  not null,
    WITH_ADMIN_OPTION enum ('N', 'Y') charset utf8mb3 default 'N' not null,
    primary key (FROM_HOST, FROM_USER, TO_HOST, TO_USER)
)
    comment 'Role hierarchy and role grants' collate = utf8mb3_bin
                                             row_format = DYNAMIC
                                             stats_persistent = 0;

create table roles
(
    id         bigint unsigned auto_increment
        primary key,
    name       varchar(255) not null,
    guard_name varchar(255) not null,
    created_at timestamp    null,
    updated_at timestamp    null,
    constraint roles_name_guard_name_unique
        unique (name, guard_name)
)
    collate = utf8mb4_unicode_ci;

create table model_has_roles
(
    role_id    bigint unsigned not null,
    model_type varchar(255)    not null,
    model_id   bigint unsigned not null,
    primary key (role_id, model_id, model_type),
    constraint model_has_roles_role_id_foreign
        foreign key (role_id) references roles (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;

create index model_has_roles_model_id_model_type_index
    on model_has_roles (model_id, model_type);

create table role_has_permissions
(
    permission_id bigint unsigned not null,
    role_id       bigint unsigned not null,
    primary key (permission_id, role_id),
    constraint role_has_permissions_permission_id_foreign
        foreign key (permission_id) references permissions (id)
            on delete cascade,
    constraint role_has_permissions_role_id_foreign
        foreign key (role_id) references roles (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;

create table server_cost
(
    cost_name     varchar(64)                         not null
        primary key,
    cost_value    float                               null,
    last_update   timestamp default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    comment       varchar(1024)                       null,
    default_value float as ((case `cost_name`
                                 when _utf8mb4'disk_temptable_create_cost' then 20.0
                                 when _utf8mb4'disk_temptable_row_cost' then 0.5
                                 when _utf8mb4'key_compare_cost' then 0.05
                                 when _utf8mb4'memory_temptable_create_cost' then 1.0
                                 when _utf8mb4'memory_temptable_row_cost' then 0.1
                                 when _utf8mb4'row_evaluate_cost' then 0.1
                                 else NULL end))
)
    charset = utf8mb3
    row_format = DYNAMIC
    stats_persistent = 0;

create table servers
(
    Server_name char(64)                default '' not null
        primary key,
    Host        char(255) charset ascii default '' not null,
    Db          char(64)                default '' not null,
    Username    char(64)                default '' not null,
    Password    char(64)                default '' not null,
    Port        int                     default 0  not null,
    Socket      char(64)                default '' not null,
    Wrapper     char(64)                default '' not null,
    Owner       char(64)                default '' not null
)
    comment 'MySQL Foreign Servers table' charset = utf8mb3
                                          row_format = DYNAMIC
                                          stats_persistent = 0;

create table slave_master_info
(
    Number_of_lines                 int unsigned                    not null comment 'Number of lines in the file.',
    Master_log_name                 text collate utf8mb3_bin        not null comment 'The name of the master binary log currently being read from the master.',
    Master_log_pos                  bigint unsigned                 not null comment 'The master log position of the last read event.',
    Host                            varchar(255) charset ascii      null comment 'The host name of the source.',
    User_name                       text collate utf8mb3_bin        null comment 'The user name used to connect to the master.',
    User_password                   text collate utf8mb3_bin        null comment 'The password used to connect to the master.',
    Port                            int unsigned                    not null comment 'The network port used to connect to the master.',
    Connect_retry                   int unsigned                    not null comment 'The period (in seconds) that the slave will wait before trying to reconnect to the master.',
    Enabled_ssl                     tinyint(1)                      not null comment 'Indicates whether the server supports SSL connections.',
    Ssl_ca                          text collate utf8mb3_bin        null comment 'The file used for the Certificate Authority (CA) certificate.',
    Ssl_capath                      text collate utf8mb3_bin        null comment 'The path to the Certificate Authority (CA) certificates.',
    Ssl_cert                        text collate utf8mb3_bin        null comment 'The name of the SSL certificate file.',
    Ssl_cipher                      text collate utf8mb3_bin        null comment 'The name of the cipher in use for the SSL connection.',
    Ssl_key                         text collate utf8mb3_bin        null comment 'The name of the SSL key file.',
    Ssl_verify_server_cert          tinyint(1)                      not null comment 'Whether to verify the server certificate.',
    Heartbeat                       float                           not null,
    Bind                            text collate utf8mb3_bin        null comment 'Displays which interface is employed when connecting to the MySQL server',
    Ignored_server_ids              text collate utf8mb3_bin        null comment 'The number of server IDs to be ignored, followed by the actual server IDs',
    Uuid                            text collate utf8mb3_bin        null comment 'The master server uuid.',
    Retry_count                     bigint unsigned                 not null comment 'Number of reconnect attempts, to the master, before giving up.',
    Ssl_crl                         text collate utf8mb3_bin        null comment 'The file used for the Certificate Revocation List (CRL)',
    Ssl_crlpath                     text collate utf8mb3_bin        null comment 'The path used for Certificate Revocation List (CRL) files',
    Enabled_auto_position           tinyint(1)                      not null comment 'Indicates whether GTIDs will be used to retrieve events from the master.',
    Channel_name                    varchar(64)                     not null comment 'The channel on which the replica is connected to a source. Used in Multisource Replication'
        primary key,
    Tls_version                     text collate utf8mb3_bin        null comment 'Tls version',
    Public_key_path                 text collate utf8mb3_bin        null comment 'The file containing public key of master server.',
    Get_public_key                  tinyint(1)                      not null comment 'Preference to get public key from master.',
    Network_namespace               text collate utf8mb3_bin        null comment 'Network namespace used for communication with the master server.',
    Master_compression_algorithm    varchar(64) collate utf8mb3_bin not null comment 'Compression algorithm supported for data transfer between source and replica.',
    Master_zstd_compression_level   int unsigned                    not null comment 'Compression level associated with zstd compression algorithm.',
    Tls_ciphersuites                text collate utf8mb3_bin        null comment 'Ciphersuites used for TLS 1.3 communication with the master server.',
    Source_connection_auto_failover tinyint(1) default 0            not null comment 'Indicates whether the channel connection failover is enabled.',
    Gtid_only                       tinyint(1) default 0            not null comment 'Indicates if this channel only uses GTIDs and does not persist positions.'
)
    comment 'Master Information' charset = utf8mb3
                                 row_format = DYNAMIC
                                 stats_persistent = 0;

create table slave_relay_log_info
(
    Number_of_lines                              int unsigned                                              not null comment 'Number of lines in the file or rows in the table. Used to version table definitions.',
    Relay_log_name                               text collate utf8mb3_bin                                  null comment 'The name of the current relay log file.',
    Relay_log_pos                                bigint unsigned                                           null comment 'The relay log position of the last executed event.',
    Master_log_name                              text collate utf8mb3_bin                                  null comment 'The name of the master binary log file from which the events in the relay log file were read.',
    Master_log_pos                               bigint unsigned                                           null comment 'The master log position of the last executed event.',
    Sql_delay                                    int                                                       null comment 'The number of seconds that the slave must lag behind the master.',
    Number_of_workers                            int unsigned                                              null,
    Id                                           int unsigned                                              null comment 'Internal Id that uniquely identifies this record.',
    Channel_name                                 varchar(64)                                               not null comment 'The channel on which the replica is connected to a source. Used in Multisource Replication'
        primary key,
    Privilege_checks_username                    varchar(32) collate utf8mb3_bin                           null comment 'Username part of PRIVILEGE_CHECKS_USER.',
    Privilege_checks_hostname                    varchar(255) charset ascii                                null comment 'Hostname part of PRIVILEGE_CHECKS_USER.',
    Require_row_format                           tinyint(1)                                                not null comment 'Indicates whether the channel shall only accept row based events.',
    Require_table_primary_key_check              enum ('STREAM', 'ON', 'OFF', 'GENERATE') default 'STREAM' not null comment 'Indicates what is the channel policy regarding tables without primary keys on create and alter table queries',
    Assign_gtids_to_anonymous_transactions_type  enum ('OFF', 'LOCAL', 'UUID')            default 'OFF'    not null comment 'Indicates whether the channel will generate a new GTID for anonymous transactions. OFF means that anonymous transactions will remain anonymous. LOCAL means that anonymous transactions will be assigned a newly generated GTID based on server_uuid. UUID indicates that anonymous transactions will be assigned a newly generated GTID based on Assign_gtids_to_anonymous_transactions_value',
    Assign_gtids_to_anonymous_transactions_value text collate utf8mb3_bin                                  null comment 'Indicates the UUID used while generating GTIDs for anonymous transactions'
)
    comment 'Relay Log Information' charset = utf8mb3
                                    row_format = DYNAMIC
                                    stats_persistent = 0;

create table slave_worker_info
(
    Id                         int unsigned             not null,
    Relay_log_name             text collate utf8mb3_bin not null,
    Relay_log_pos              bigint unsigned          not null,
    Master_log_name            text collate utf8mb3_bin not null,
    Master_log_pos             bigint unsigned          not null,
    Checkpoint_relay_log_name  text collate utf8mb3_bin not null,
    Checkpoint_relay_log_pos   bigint unsigned          not null,
    Checkpoint_master_log_name text collate utf8mb3_bin not null,
    Checkpoint_master_log_pos  bigint unsigned          not null,
    Checkpoint_seqno           int unsigned             not null,
    Checkpoint_group_size      int unsigned             not null,
    Checkpoint_group_bitmap    blob                     not null,
    Channel_name               varchar(64)              not null comment 'The channel on which the replica is connected to a source. Used in Multisource Replication',
    primary key (Channel_name, Id)
)
    comment 'Worker Information' charset = utf8mb3
                                 row_format = DYNAMIC
                                 stats_persistent = 0;

create table slow_log
(
    start_time     timestamp(6) default CURRENT_TIMESTAMP(6) not null on update CURRENT_TIMESTAMP(6),
    user_host      mediumtext                                not null,
    query_time     time(6)                                   not null,
    lock_time      time(6)                                   not null,
    rows_sent      int                                       not null,
    rows_examined  int                                       not null,
    db             varchar(512)                              not null,
    last_insert_id int                                       not null,
    insert_id      int                                       not null,
    server_id      int unsigned                              not null,
    sql_text       mediumblob                                not null,
    thread_id      bigint unsigned                           not null
)
    comment 'Slow log' engine = CSV
                       charset = utf8mb3;

create table step_count_master
(
    id         int auto_increment
        primary key,
    device_id  varchar(255) null,
    step_count varchar(255) null,
    date       varchar(255) null,
    created_at timestamp    null,
    updated_at timestamp    null
)
    charset = utf8mb3;

create table tables_priv
(
    Host        char(255) charset ascii                                                                                                                                        default ''                not null,
    Db          char(64)                                                                                                                                                       default ''                not null,
    User        char(32)                                                                                                                                                       default ''                not null,
    Table_name  char(64)                                                                                                                                                       default ''                not null,
    Grantor     varchar(288)                                                                                                                                                   default ''                not null,
    Timestamp   timestamp                                                                                                                                                      default CURRENT_TIMESTAMP not null on update CURRENT_TIMESTAMP,
    Table_priv  set ('Select', 'Insert', 'Update', 'Delete', 'Create', 'Drop', 'Grant', 'References', 'Index', 'Alter', 'Create View', 'Show view', 'Trigger') charset utf8mb3 default ''                not null,
    Column_priv set ('Select', 'Insert', 'Update', 'References') charset utf8mb3                                                                                               default ''                not null,
    primary key (Host, User, Db, Table_name)
)
    comment 'Table privileges' collate = utf8mb3_bin
                               row_format = DYNAMIC
                               stats_persistent = 0;

create index Grantor
    on tables_priv (Grantor);

create table time_zone
(
    Time_zone_id     int unsigned auto_increment
        primary key,
    Use_leap_seconds enum ('Y', 'N') default 'N' not null
)
    comment 'Time zones' charset = utf8mb3
                         row_format = DYNAMIC
                         stats_persistent = 0;

create table time_zone_leap_second
(
    Transition_time bigint not null
        primary key,
    Correction      int    not null
)
    comment 'Leap seconds information for time zones' charset = utf8mb3
                                                      row_format = DYNAMIC
                                                      stats_persistent = 0;

create table time_zone_name
(
    Name         char(64)     not null
        primary key,
    Time_zone_id int unsigned not null
)
    comment 'Time zone names' charset = utf8mb3
                              row_format = DYNAMIC
                              stats_persistent = 0;

create table time_zone_transition
(
    Time_zone_id       int unsigned not null,
    Transition_time    bigint       not null,
    Transition_type_id int unsigned not null,
    primary key (Time_zone_id, Transition_time)
)
    comment 'Time zone transitions' charset = utf8mb3
                                    row_format = DYNAMIC
                                    stats_persistent = 0;

create table time_zone_transition_type
(
    Time_zone_id       int unsigned                 not null,
    Transition_type_id int unsigned                 not null,
    Offset             int              default 0   not null,
    Is_DST             tinyint unsigned default '0' not null,
    Abbreviation       char(8)          default ''  not null,
    primary key (Time_zone_id, Transition_type_id)
)
    comment 'Time zone transition types' charset = utf8mb3
                                         row_format = DYNAMIC
                                         stats_persistent = 0;

create table user
(
    Host                     char(255) charset ascii                               default ''                      not null,
    User                     char(32)                                              default ''                      not null,
    Select_priv              enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Insert_priv              enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Update_priv              enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Delete_priv              enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_priv              enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Drop_priv                enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Reload_priv              enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Shutdown_priv            enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Process_priv             enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    File_priv                enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Grant_priv               enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    References_priv          enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Index_priv               enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Alter_priv               enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Show_db_priv             enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Super_priv               enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_tmp_table_priv    enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Lock_tables_priv         enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Execute_priv             enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Repl_slave_priv          enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Repl_client_priv         enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_view_priv         enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Show_view_priv           enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_routine_priv      enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Alter_routine_priv       enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_user_priv         enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Event_priv               enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Trigger_priv             enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_tablespace_priv   enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    ssl_type                 enum ('', 'ANY', 'X509', 'SPECIFIED') charset utf8mb3 default ''                      not null,
    ssl_cipher               blob                                                                                  not null,
    x509_issuer              blob                                                                                  not null,
    x509_subject             blob                                                                                  not null,
    max_questions            int unsigned                                          default '0'                     not null,
    max_updates              int unsigned                                          default '0'                     not null,
    max_connections          int unsigned                                          default '0'                     not null,
    max_user_connections     int unsigned                                          default '0'                     not null,
    plugin                   char(64)                                              default 'caching_sha2_password' not null,
    authentication_string    text                                                                                  null,
    password_expired         enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    password_last_changed    timestamp                                                                             null,
    password_lifetime        smallint unsigned                                                                     null,
    account_locked           enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Create_role_priv         enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Drop_role_priv           enum ('N', 'Y') charset utf8mb3                       default 'N'                     not null,
    Password_reuse_history   smallint unsigned                                                                     null,
    Password_reuse_time      smallint unsigned                                                                     null,
    Password_require_current enum ('N', 'Y') charset utf8mb3                                                       null,
    User_attributes          json                                                                                  null,
    primary key (Host, User)
)
    comment 'Users and global privileges' collate = utf8mb3_bin
                                          row_format = DYNAMIC
                                          stats_persistent = 0;

grant select on table user to 'mysql.session'@localhost;

create table users
(
    id                  int unsigned auto_increment
        primary key,
    slug                varchar(255)                                   null,
    name                varchar(255)                                   null,
    email               varchar(255)                                   null,
    mobile_number       varchar(255)                                   not null,
    email_verified_at   timestamp                                      null,
    password            varchar(255)                                   null,
    fcm_token           varchar(255)                                   null,
    lat                 varchar(255)                                   null,
    `long`              varchar(255)                                   null,
    otp                 varchar(255)                                   null,
    otp_verify          varchar(255)                default '0'        null,
    status              enum ('active', 'inactive') default 'inactive' not null,
    image               varchar(255)                                   null,
    remember_token      varchar(100)                                   null,
    unique_device_id    varchar(255)                                   null,
    unique_device_model varchar(255)                                   null,
    created_at          timestamp                                      null,
    updated_at          timestamp                                      null,
    constraint users_mobile_number_unique
        unique (mobile_number)
)
    collate = utf8mb4_unicode_ci;

create table children
(
    id         int unsigned auto_increment
        primary key,
    parent_id  int unsigned not null,
    slug       varchar(255) null,
    image      varchar(255) null,
    child_name varchar(255) null,
    device_id  varchar(255) null,
    gender     varchar(255) null,
    dob        varchar(255) null,
    created_at timestamp    null,
    updated_at timestamp    null,
    constraint children_parent_id_foreign
        foreign key (parent_id) references users (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;

create table child_location_shares
(
    id         int unsigned auto_increment
        primary key,
    child_id   int unsigned             not null,
    slug       varchar(255)             null,
    start_time varchar(255)             null,
    end_time   varchar(255)             null,
    minutes    varchar(255)             null,
    status     varchar(255) default '1' null,
    created_at timestamp                null,
    updated_at timestamp                null,
    constraint child_location_shares_child_id_foreign
        foreign key (child_id) references children (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;

create table location_tracks
(
    id          int unsigned auto_increment
        primary key,
    child_id    int unsigned not null,
    slug        varchar(255) null,
    latitude    varchar(255) null,
    longitude   varchar(255) null,
    device_name varchar(255) null,
    location    varchar(255) null,
    created_at  timestamp    null,
    updated_at  timestamp    null,
    constraint location_tracks_child_id_foreign
        foreign key (child_id) references children (id)
            on delete cascade
)
    collate = utf8mb4_unicode_ci;
