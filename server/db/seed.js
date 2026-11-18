import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { pool, withTransaction } from './pool.js';
import { runMigrations } from './migrate.js';

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_SUPER_ADMIN = {
  name: 'Sai Deepak',
  username: 'sai.deepak',
  email: 'sai.deepak@iamneo.ai',
  avatar_url: null,
  phone: null,
  location: null,
  specialty: 'Workspace Administration',
  skills: [],
  bio: 'Workspace Super Admin.',
};

async function ensureDefaultSuperAdmin(passwordHash) {
  const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'super_admin'");
  const projectManagerRoleRes = await pool.query("SELECT id FROM roles WHERE name = 'project_manager'");
  if (roleRes.rowCount === 0 || projectManagerRoleRes.rowCount === 0) return;
  const superAdminRoleId = roleRes.rows[0].id;
  const projectManagerRoleId = projectManagerRoleRes.rows[0].id;

  const sa = DEFAULT_SUPER_ADMIN;
  await pool.query(
    `INSERT INTO users (
      role_id, name, username, email, password_hash, avatar_url, phone, location,
      specialty, hourly_rate, skills, bio, status, email_verified
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10::jsonb,$11,'active',TRUE)
    ON CONFLICT (email) DO UPDATE SET
      role_id = EXCLUDED.role_id,
      name = EXCLUDED.name,
      username = EXCLUDED.username,
      password_hash = EXCLUDED.password_hash,
      status = 'active',
      email_verified = TRUE`,
    [
      superAdminRoleId,
      sa.name,
      sa.username,
      sa.email,
      passwordHash,
      sa.avatar_url,
      sa.phone,
      sa.location,
      sa.specialty,
      JSON.stringify(sa.skills),
      sa.bio,
    ]
  );

  await pool.query(
    `UPDATE users
     SET role_id = $1, status = 'deactivated', updated_at = NOW()
     WHERE role_id = $2 AND email = ANY($3::text[])`,
    [
      projectManagerRoleId,
      superAdminRoleId,
      [
        'admin@taskupcard.com',
        'admin2@taskupcard.com',
        'admin3@taskupcard.com',
        'admin4@taskupcard.com',
        'admin5@taskupcard.com',
      ],
    ]
  );
}

export async function runSeed() {
  await runMigrations();

  const existingRoles = await pool.query('SELECT COUNT(*)::int AS count FROM roles');
  if (existingRoles.rows[0].count === 0) {
    await pool.query(`
      INSERT INTO roles (name, label, description) VALUES
        ('super_admin', 'Super Admin', 'Full workspace control, user administration, analytics, and settings.'),
        ('project_manager', 'Project Manager', 'Creates projects, assigns tasks, sets deadlines, reviews deliverables.'),
        ('freelancer', 'Freelancer', 'External contributor with access only to assigned tasks and shared projects.')
      ON CONFLICT (name) DO NOTHING;
    `);
  }

  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!superAdminPassword) {
    throw new Error('[DB] SUPER_ADMIN_PASSWORD is required to seed the default Super Admin.');
  }
  const superAdminPasswordHash = await bcrypt.hash(superAdminPassword, 10);
  const demoPasswordHash = await bcrypt.hash('TaskUp2026!', 10);
  await ensureDefaultSuperAdmin(superAdminPasswordHash);

  const existingProjects = await pool.query('SELECT COUNT(*)::int AS count FROM projects');
  if (existingProjects.rows[0].count > 0) {
    console.log('[DB] Seed skipped: workspace data already exists (default Super Admin verified).');
    return;
  }

  await withTransaction(async (client) => {
    const rolesRes = await client.query('SELECT id, name FROM roles');
    const roleMap = Object.fromEntries(rolesRes.rows.map((r) => [r.name, r.id]));

    const usersToInsert = [
      {
        role_id: roleMap.project_manager,
        name: 'Elena Rostova',
        username: 'elena.rostova',
        email: 'manager@taskupcard.com',
        avatar_url: '/src/assets/images/avatar_manager_1794983754367.jpg',
        phone: '+1 (312) 449-8820',
        location: 'Chicago, USA',
        specialty: 'Program Delivery',
        hourly_rate: 0,
        skills: ['Agile Delivery', 'QA Review', 'CurriculumOps'],
        bio: 'Program Manager coordinating design, localization, and external engineering vendors.',
      },
      {
        role_id: roleMap.freelancer,
        name: 'Clara Chen',
        username: 'clara.chen',
        email: 'clara@studio-chen.io',
        avatar_url: '/src/assets/images/avatar_freelancer_one_1794983753812.jpg',
        phone: '+44 20 7946 0192',
        location: 'London, UK',
        specialty: 'Product & Brand Design',
        hourly_rate: 115,
        skills: ['UI Systems', 'Figma', 'Design Tokens', 'Accessibility'],
        bio: 'Independent systems designer specializing in enterprise web applications and brand kits.',
      },
      {
        role_id: roleMap.freelancer,
        name: 'Arthur Sterling',
        username: 'arthur.sterling',
        email: 'arthur@sterlingdev.net',
        avatar_url: '/src/assets/images/avatar_freelancer_two_1794983755683.jpg',
        phone: '+1 (206) 555-0148',
        location: 'Seattle, USA',
        specialty: 'Full-Stack & API Integrations',
        hourly_rate: 135,
        skills: ['Node.js', 'PostgreSQL', 'REST APIs', 'Security Audits'],
        bio: 'Senior contract engineer delivering backend pipelines, webhooks, and technical audits.',
      },
      {
        role_id: roleMap.freelancer,
        name: 'Nadia Al-Mansoor',
        username: 'nadia.mansoor',
        email: 'nadia@trainerhub.org',
        avatar_url: null,
        phone: '+971 50 482 1190',
        location: 'Dubai, UAE',
        specialty: 'External Technical Trainer',
        hourly_rate: 95,
        skills: ['Curriculum Design', 'Workshops', 'Video Production', 'LMS'],
        bio: 'External corporate trainer producing onboarding labs and technical certification guides.',
      },
    ];

    const insertedUsers = {};
    for (const u of usersToInsert) {
      const res = await client.query(
        `INSERT INTO users (
          role_id, name, username, email, password_hash, avatar_url, phone, location,
          specialty, hourly_rate, skills, bio, status, email_verified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'active',TRUE)
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING id, email, name, username`,
        [
          u.role_id,
          u.name,
          u.username,
          u.email,
          demoPasswordHash,
          u.avatar_url,
          u.phone,
          u.location,
          u.specialty,
          u.hourly_rate,
          JSON.stringify(u.skills),
          u.bio,
        ]
      );
      insertedUsers[u.email] = res.rows[0];
    }

    const admin = (await client.query(
      'SELECT id, email, name, username FROM users WHERE email = $1',
      [DEFAULT_SUPER_ADMIN.email]
    )).rows[0];
    const manager = insertedUsers['manager@taskupcard.com'];
    const clara = insertedUsers['clara@studio-chen.io'];
    const arthur = insertedUsers['arthur@sterlingdev.net'];
    const nadia = insertedUsers['nadia@trainerhub.org'];

    const now = new Date();
    const dayOffset = (days) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d.toISOString();
    };
    const dateOffset = (days) => dayOffset(days).slice(0, 10);

    // Projects
    const projectsData = [
      {
        code: 'PRJ-201',
        name: 'Q4 Partner Portal Redesign',
        description: 'External contractor UI refresh, responsive component library, and accessible deliverable handoff workflows.',
        manager_id: manager.id,
        status: 'active',
        start_date: dateOffset(-21),
        end_date: dateOffset(24),
        color: '#2563EB',
        members: [manager.id, clara.id, arthur.id],
      },
      {
        code: 'PRJ-202',
        name: 'Enterprise Compliance Training Series',
        description: 'Multi-module training curriculum, slide decks, and interactive assessment workbooks created by external trainers.',
        manager_id: manager.id,
        status: 'active',
        start_date: dateOffset(-14),
        end_date: dateOffset(30),
        color: '#0D9488',
        members: [manager.id, nadia.id, clara.id],
      },
      {
        code: 'PRJ-203',
        name: 'Billing Webhook & ERP Bridge',
        description: 'Contracted integration microservice synchronizing contractor milestone approvals with finance ledgers.',
        manager_id: admin.id,
        status: 'planning',
        start_date: dateOffset(-3),
        end_date: dateOffset(40),
        color: '#7C3AED',
        members: [admin.id, manager.id, arthur.id],
      },
    ];

    const insertedProjects = {};
    for (const p of projectsData) {
      const pRes = await client.query(
        `INSERT INTO projects (code, name, description, manager_id, status, start_date, end_date, color, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, code, name`,
        [p.code, p.name, p.description, p.manager_id, p.status, p.start_date, p.end_date, p.color, admin.id]
      );
      const proj = pRes.rows[0];
      insertedProjects[p.code] = proj;
      for (const uid of p.members) {
        await client.query(
          `INSERT INTO project_members (project_id, user_id, member_role)
           VALUES ($1,$2,$3) ON CONFLICT (project_id, user_id) DO NOTHING`,
          [proj.id, uid, uid === p.manager_id ? 'manager' : 'contributor']
        );
      }
    }

    // Tags
    const tagDefs = [
      { name: 'design-system', color: '#2563EB' },
      { name: 'deliverable', color: '#059669' },
      { name: 'security', color: '#DC2626' },
      { name: 'training', color: '#D97706' },
      { name: 'api-bridge', color: '#7C3AED' },
      { name: 'qa-review', color: '#0284C7' },
    ];
    const tagMap = {};
    for (const t of tagDefs) {
      const tRes = await client.query(
        `INSERT INTO tags (name, color) VALUES ($1,$2)
         ON CONFLICT (name) DO UPDATE SET color = EXCLUDED.color
         RETURNING id, name`,
        [t.name, t.color]
      );
      tagMap[t.name] = tRes.rows[0].id;
    }

    // Tasks
    const tasksData = [
      {
        project: 'PRJ-201',
        creator: manager.id,
        assignees: [clara.id],
        title: 'Finalize Partner Portal Typography & Token Spec',
        description: 'Audit contrast ratios across light and dark modes and export production CSS variable tokens for the engineering handoff.',
        status: 'in_progress',
        priority: 'high',
        assigned_date: dateOffset(-6),
        start_date: dateOffset(-5),
        due_date: dayOffset(2),
        estimated_hours: 12,
        actual_hours: 7.5,
        tags: ['design-system', 'deliverable'],
        subtasks: [
          { title: 'Verify WCAG AA contrast on slate surfaces', done: true, assignee: clara.id },
          { title: 'Export dark mode token mapping sheet', done: false, assignee: clara.id },
        ],
        checklist: {
          title: 'Handoff Readiness',
          items: [
            { label: 'Desktop 1440px breakpoint reviewed', checked: true },
            { label: 'Tablet 768px sidebar collapse tested', checked: true },
            { label: 'SVG icon stroke consistency verified', checked: false },
          ],
        },
        comments: [
          { user: manager.id, body: 'Looks crisp so far @clara.chen — please ensure the tabular figures stay aligned on metric tables.' },
          { user: clara.id, body: 'Updated the font weights and added tabular-nums across all numeric cells. Final token export coming tomorrow.' },
        ],
      },
      {
        project: 'PRJ-201',
        creator: manager.id,
        assignees: [arthur.id],
        title: 'Implement Signed File Upload & Download Endpoints',
        description: 'Configure multipart validation, file extension allowlists, and permission-checked download streaming without storing binaries in Postgres.',
        status: 'under_review',
        priority: 'urgent',
        assigned_date: dateOffset(-9),
        start_date: dateOffset(-8),
        due_date: dayOffset(1),
        estimated_hours: 16,
        actual_hours: 14,
        tags: ['api-bridge', 'security'],
        subtasks: [
          { title: 'Add MIME & extension validation middleware', done: true, assignee: arthur.id },
          { title: 'Enforce task/project membership check on download', done: true, assignee: arthur.id },
        ],
        checklist: {
          title: 'Security Verification',
          items: [
            { label: 'Path traversal sanitization active', checked: true },
            { label: 'Max file size 15MB enforced', checked: true },
          ],
        },
        comments: [
          { user: arthur.id, body: 'Moved binary payload storage to the isolated object store directory and linked metadata in Neon. Ready for QA @elena.rostova.' },
        ],
      },
      {
        project: 'PRJ-201',
        creator: manager.id,
        assignees: [clara.id],
        title: 'Design Contractor Onboarding Empty States',
        description: 'Create calm, actionable empty states for task lists, project overviews, and notification history.',
        status: 'completed',
        priority: 'normal',
        assigned_date: dateOffset(-15),
        start_date: dateOffset(-14),
        due_date: dateOffset(-3) + 'T17:00:00.000Z',
        estimated_hours: 8,
        actual_hours: 7,
        completed_at: dayOffset(-4),
        tags: ['design-system'],
        subtasks: [],
        comments: [
          { user: manager.id, body: 'Approved and merged into the Q4 milestone.' },
        ],
      },
      {
        project: 'PRJ-202',
        creator: manager.id,
        assignees: [nadia.id],
        title: 'Deliver Module 3 Data Privacy Workbook (PDF + Slides)',
        description: 'Produce trainer deck (PPTX) and participant reference workbook covering vendor data handling standards.',
        status: 'revision_required',
        priority: 'high',
        assigned_date: dateOffset(-10),
        start_date: dateOffset(-9),
        due_date: dayOffset(-2), // Overdue!
        estimated_hours: 14,
        actual_hours: 11,
        tags: ['training', 'deliverable'],
        subtasks: [
          { title: 'Update GDPR annex slide 14', done: false, assignee: nadia.id },
          { title: 'Re-export accessible PDF workbook', done: false, assignee: nadia.id },
        ],
        comments: [
          { user: manager.id, body: '@nadia.mansoor please revise Slide 14 to reflect the 2026 vendor retention policy before final sign-off.' },
        ],
      },
      {
        project: 'PRJ-202',
        creator: manager.id,
        assignees: [nadia.id, clara.id],
        title: 'Record Facilitator Walkthrough & Slide Templates',
        description: 'Align presentation templates with TaskUpCard editorial grid and record a 15-minute facilitator briefing.',
        status: 'todo',
        priority: 'normal',
        assigned_date: dateOffset(-2),
        start_date: dateOffset(0),
        due_date: dayOffset(6),
        estimated_hours: 10,
        actual_hours: 0,
        tags: ['training', 'design-system'],
        subtasks: [],
        comments: [],
      },
      {
        project: 'PRJ-203',
        creator: admin.id,
        assignees: [arthur.id],
        title: 'Webhook Signature Verification & Retry Queue',
        description: 'Implement HMAC-SHA256 verification and idempotency keys for outbound finance ledger synchronization.',
        status: 'open',
        priority: 'high',
        assigned_date: dateOffset(-1),
        start_date: dateOffset(1),
        due_date: dayOffset(10),
        estimated_hours: 20,
        actual_hours: 2,
        tags: ['api-bridge', 'security'],
        subtasks: [
          { title: 'Draft idempotency table index', done: true, assignee: arthur.id },
          { title: 'Write signature verification unit test', done: false, assignee: arthur.id },
        ],
        comments: [],
      },
      {
        project: 'PRJ-203',
        creator: admin.id,
        assignees: [arthur.id],
        title: 'Audit Rate Limiting & CORS Policy Across API Routes',
        description: 'Ensure strict CORS allowlisting and per-IP rate limits on auth and upload routes.',
        status: 'completed',
        priority: 'low',
        assigned_date: dateOffset(-12),
        start_date: dateOffset(-11),
        due_date: dayOffset(-5),
        estimated_hours: 6,
        actual_hours: 5.5,
        completed_at: dayOffset(-6),
        tags: ['security', 'qa-review'],
        subtasks: [],
        comments: [],
      },
    ];

    for (let idx = 0; idx < tasksData.length; idx++) {
      const t = tasksData[idx];
      const seqRes = await client.query("SELECT nextval('task_code_seq') AS seq");
      const taskCode = `TUC-${seqRes.rows[0].seq}`;
      const project = insertedProjects[t.project];

      const taskRes = await client.query(
        `INSERT INTO tasks (
          task_code, project_id, creator_id, title, description, status, priority,
          assigned_date, start_date, due_date, estimated_hours, actual_hours, position, completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id, task_code, title`,
        [
          taskCode,
          project.id,
          t.creator,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.assigned_date,
          t.start_date,
          t.due_date,
          t.estimated_hours,
          t.actual_hours,
          idx,
          t.completed_at || null,
        ]
      );
      const task = taskRes.rows[0];

      // Assignees & watchers
      for (const uid of t.assignees) {
        await client.query(
          `INSERT INTO task_assignees (task_id, user_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [task.id, uid, t.creator]
        );
        await client.query(
          `INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [task.id, uid]
        );
      }
      await client.query(
        `INSERT INTO task_watchers (task_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [task.id, t.creator]
      );

      // Tags
      for (const tagName of t.tags) {
        if (tagMap[tagName]) {
          await client.query(
            `INSERT INTO task_tags (task_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [task.id, tagMap[tagName]]
          );
        }
      }

      // Subtasks
      for (let sIdx = 0; sIdx < t.subtasks.length; sIdx++) {
        const s = t.subtasks[sIdx];
        await client.query(
          `INSERT INTO subtasks (task_id, title, is_completed, assignee_id, position) VALUES ($1,$2,$3,$4,$5)`,
          [task.id, s.title, s.done, s.assignee, sIdx]
        );
      }

      // Checklist
      if (t.checklist) {
        const clRes = await client.query(
          `INSERT INTO task_checklists (task_id, title, position) VALUES ($1,$2,0) RETURNING id`,
          [task.id, t.checklist.title]
        );
        for (let cIdx = 0; cIdx < t.checklist.items.length; cIdx++) {
          const item = t.checklist.items[cIdx];
          await client.query(
            `INSERT INTO task_checklist_items (checklist_id, label, is_checked, position) VALUES ($1,$2,$3,$4)`,
            [clRes.rows[0].id, item.label, item.checked, cIdx]
          );
        }
      }

      // Comments
      for (const c of t.comments) {
        await client.query(
          `INSERT INTO task_comments (task_id, user_id, body) VALUES ($1,$2,$3)`,
          [task.id, c.user, c.body]
        );
      }

      // Time entries if actual_hours > 0
      if (t.actual_hours > 0 && t.assignees[0]) {
        await client.query(
          `INSERT INTO time_entries (task_id, user_id, hours, description, logged_date) VALUES ($1,$2,$3,$4,$5)`,
          [task.id, t.assignees[0], t.actual_hours, 'Initial milestone work logged', dateOffset(-1)]
        );
      }

      // Activity log
      await client.query(
        `INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES ($1,$2,$3,'task_created',$4::jsonb)`,
        [project.id, task.id, t.creator, JSON.stringify({ title: task.title, task_code: task.task_code })]
      );
    }

    // Notifications for demo users
    await client.query(
      `INSERT INTO notifications (user_id, actor_id, type, title, message, link, is_read) VALUES
        ($1, $2, 'task_assigned', 'New urgent review awaiting QA', 'Arthur Sterling moved signed upload endpoints to Under Review.', '/tasks', FALSE),
        ($3, $2, 'mention', 'Elena Rostova mentioned you', 'Please ensure tabular figures stay aligned on metric tables.', '/tasks', FALSE),
        ($4, $2, 'revision_required', 'Revision requested on Module 3 Workbook', 'Please update Slide 14 for the 2026 retention policy.', '/tasks', FALSE)`,
      [manager.id, arthur.id, clara.id, nadia.id]
    );

    // Default App Settings
    await client.query(
      `INSERT INTO app_settings (key, value, updated_by) VALUES
        ('workspace', $1::jsonb, $2),
        ('notifications', $3::jsonb, $2)
       ON CONFLICT (key) DO NOTHING`,
      [
        JSON.stringify({
          organizationName: 'TaskUpCard Workspace',
          allowFreelancerSelfLogTime: true,
          requireReviewBeforeComplete: true,
          maxUploadMb: 15,
          defaultTaskPriority: 'normal',
        }),
        admin.id,
        JSON.stringify({
          emailOnTaskAssign: true,
          emailOnMention: true,
          emailOnDeadlineApproaching: true,
          deadlineReminderHours: 48,
        }),
      ]
    );
  });

  console.log('[DB] Seed completed successfully.');
}

if (process.argv[1] === __filename) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DB] Seed failed:', err);
      process.exit(1);
    });
}
