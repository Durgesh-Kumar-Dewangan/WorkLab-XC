/** The help centre's questions, grouped by what a learner is trying to do. Plain answers, no promises the product cannot keep. */
export interface FaqGroup {
  id: string;
  title: string;
  items: [q: string, a: string][];
}

export const FAQ: FaqGroup[] = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      ['What is WorkLab XC?', 'You give it a syllabus. It builds a course map of units and topics, writes a lesson for every topic with AI, and lets you study each one in a lesson view or a 3D classroom, then practise with games, quizzes and exams.'],
      ['Do I need to pay to start?', 'No. Free gives you unlimited learning sessions for one subject at a time, with ads. Beta and Beta Plus unlock the 3D classroom without limits, no ads, more subjects, games, quizzes and practice exams. See the Pricing page for the current prices.'],
      ['How do I get my first lesson?', 'Create an account, open Upload syllabus, add your outline, then open Learn and choose the first topic. The lesson is written the first time you open a topic, which can take a few seconds.'],
      ['Can I try it without an account?', 'Yes. The sample on the “See how it works” page runs a classroom and a sample syllabus with no sign-up and no key.'],
      ['Which devices and browsers work?', 'Any current Chrome, Edge, Firefox or Safari on a laptop, tablet or phone. The 3D classroom needs WebGL; without it you get the 2D lesson view. On a phone, turn it to landscape for a wider classroom.'],
      ['Can I install it as an app?', 'Yes. Open the account menu and choose Download app. If your browser does not offer it, use the browser menu and choose Install app or Add to Home screen.'],
    ],
  },
  {
    id: 'account',
    title: 'Account and sign-in',
    items: [
      ['Why do I have to fill in so many details when I sign up?', 'Age, what you study, syllabus type, class and institute are used to pitch lessons at the right level and to reuse lessons made for the same syllabus. You can edit them later in Profile.'],
      ['Can I sign in with Google?', 'Yes, when Google sign-in is switched on for the site you will see “Continue with Google” on the sign-in and create-account pages. A new Google user is still asked for the same few details.'],
      ['I did not get the verification email.', 'Check spam and promotions. In Settings you can ask for a new link. Make sure the address was typed correctly. Payments and some features need a confirmed email.'],
      ['I forgot my password.', 'Use “Forgot password?” on the sign-in page. We email a reset link that works once and expires. If you signed up with Google, use Continue with Google instead.'],
      ['How long do I stay signed in?', 'About 30 days on the same device. Opening the home page when you are signed in takes you straight to your workspace. Use Sign Out in the account menu on shared computers.'],
      ['How do I change my name, photo or age?', 'Open Profile from the account menu. Your photo and name default to what you used at sign-up.'],
      ['How do I delete my account?', 'Settings has a delete option. It permanently removes your account, courses, lessons and sessions. Payment records are kept as the law requires. You can also download your data first.'],
    ],
  },
  {
    id: 'syllabus',
    title: 'Uploading a syllabus',
    items: [
      ['Which files can I upload?', 'Text and Markdown on every plan. PDF and Word on Beta and Beta Plus. You can also paste the outline into the box. The limit is 5 MB per file.'],
      ['What should a syllabus look like?', 'Put each unit as a heading and each topic on its own line under it, for example “## Unit 1: Motion” then “- Velocity”. Page numbers in brackets such as (p. 3) are kept. PDFs with clear headings work best.'],
      ['My upload says it found no topics.', 'The file may be scanned images or have no headings. Paste the text instead, put topics on separate lines, or use a text-based PDF. Very short or empty files are rejected.'],
      ['How many courses can I have?', 'Free keeps one subject at a time. Delete it to start another, or use Beta for unlimited subjects.'],
      ['Can I fix units and topics after it is built?', 'Yes. The course map shows the units and topics it found, and prerequisite links it inferred are marked so you can accept or remove them.'],
      ['Why is my syllabus too long?', 'Free reads up to 15,000 characters and Beta up to 60,000. Trim it, or split it into two courses.'],
    ],
  },
  {
    id: 'lessons',
    title: 'Lessons and AI',
    items: [
      ['How are lessons made?', 'AI writes a summary, slides with narration and check questions for the topic. Once written, a lesson is saved and reused, so opening it again is instant and later learners get it too.'],
      ['Is the AI always right?', 'No. Lessons and marks can contain mistakes. Treat them as study help, check anything important against your textbook, and use the report and feedback buttons to tell us about errors.'],
      ['A lesson says AI is not available.', 'That means no AI provider is set up on the server yet, or all providers are busy. Try again in a minute. If it keeps happening, contact support from the Support page.'],
      ['Can two learners get the same lesson?', 'Yes. Lessons are saved once per topic name and shared, so private details should not go in a topic title. You can switch sharing off in Settings.'],
      ['Can I get a fresh version of a lesson, game or quiz?', 'Yes, ask for a new version. A rewrite replaces the shared copy with the newer one.'],
      ['Why do some questions say “not covered by the lesson”?', 'The tutor answers from that topic’s lesson. If your question is outside it, it says so and gives a short, careful pointer marked as outside the lesson.'],
      ['Can I get notes by marks?', 'Yes. Pick a unit, give the marks each topic carries, and you get exam notes sized to those marks. Each account includes 2 a month, and the unlimited notes add-on removes the limit.'],
    ],
  },
  {
    id: 'classroom',
    title: 'The 3D classroom',
    items: [
      ['What is the 3D classroom?', 'A lecture hall with a presentation screen that runs your slides, a left board that explains in words, a right board that shows the live question or formula, and a physics model stage.'],
      ['How many classroom sessions do I get?', 'Free includes one classroom session a month. Beta and Beta Plus are unlimited. Opening the same topic again in the same month does not use a second session.'],
      ['The classroom is black or empty.', 'Wait a few seconds for the model to load. Then check that your browser supports WebGL (visit get.webgl.org), update your graphics driver, try another browser, and set 3D quality to Low in Settings. If it still fails, the 2D lesson view has the same lesson.'],
      ['The classroom is slow or my phone gets warm.', 'Lower the 3D quality in Settings, close other tabs, and turn on reduced motion. Weak devices are limited to a lighter quality automatically.'],
      ['How do I zoom to the board?', 'Use the + and − buttons on the stage, pinch with two fingers, or scroll. The fit button brings the whole screen back. You cannot zoom out of the room or lose the screen.'],
      ['How do I use it on a phone?', 'In portrait the classroom is a video-style player at the top with study tabs below. Turn the phone sideways for a bigger stage.'],
      ['Can I turn off narration or captions?', 'Yes. Use the captions and speaker buttons on the stage, or the keys C and M. Playback speed is on the bar at the bottom.'],
    ],
  },
  {
    id: 'practice',
    title: 'Practice, exams and progress',
    items: [
      ['What can I practise?', 'Beta and Beta Plus include games, quizzes and practice exams. Free is lessons only.'],
      ['How do practice exams work?', 'Choose a course, topics, number of questions, time and question types. Sit the paper in a timed window with typed answers, or upload a photo of your handwritten sheet. Answers are shown only after marking.'],
      ['Can it mark my handwriting?', 'Yes, from a clear photo. If the handwriting is hard to read, some marks may be missing, and you will be told. AI marks are a guide, not an official grade.'],
      ['What does the activity graph show?', 'How much you studied each day, like a contribution graph, with your streak. Study points are one per minute studied.'],
      ['Why is a topic locked?', 'Topics unlock one at a time. Finish the current topic and score 60% or more on its checks to open the next.'],
      ['How is my mastery estimate worked out?', 'From your own answers, with recent answers counting more. It is an estimate to help you decide what to revise, not a grade.'],
    ],
  },
  {
    id: 'billing',
    title: 'Plans, payments and add-ons',
    items: [
      ['What is the difference between Free, Beta and Beta Plus?', 'Free: one subject, unlimited sessions, ads. Beta: the 3D classroom without limits, no ads, unlimited subjects, games, quizzes, practice exams, PDF and Word syllabi. Beta Plus: Beta plus the Study pack (AI tutor chat and unlimited notes) at a lower price than buying them separately.'],
      ['How do I pay?', 'On the Pricing page choose a plan and press Buy. You pay on a secure Razorpay page with UPI, cards or netbanking. We never see your card details.'],
      ['I paid but my plan has not changed.', 'It normally switches on within a minute of the payment. Refresh the page and check Settings, Purchases. If it still shows Free, send us the payment id from your receipt on the Support page and we will fix it.'],
      ['Where is my invoice or receipt?', 'We email a receipt after each payment, and Settings, Purchases lists every payment with its payment id and what it switched on. GST invoices are available when invoicing is enabled.'],
      ['Does my plan renew automatically?', 'Only if you tick “Renew automatically” when you buy. Otherwise it simply ends at the end of the period, and you get a reminder a few days before. You can cancel auto-renewal at any time in Settings.'],
      ['What happens to my courses if my plan ends?', 'Nothing is deleted. Your account returns to Free, so you keep your courses but Free limits apply again, such as one subject being active.'],
      ['What are add-ons?', 'Unit notes by marks (one unit), unlimited notes for 30 days, the AI tutor chat for 30 days, and the Study pack (chat and unlimited notes together). Every account also gets 2 tutor questions and 2 unit notes a month free.'],
      ['Can I get a refund?', 'See the Refund policy page for the rules. For a mistaken or duplicate payment, contact support with the payment id.'],
      ['Is there a discount for paying yearly?', 'Yes. The yearly price is shown per month with the amount you save on the Pricing page.'],
    ],
  },
  {
    id: 'support',
    title: 'Support and contact',
    items: [
      ['How do I contact you?', 'Open Support in the account menu. Write a message and we reply in the same chat. You never have to share a phone number, and we never see yours.'],
      ['Can I book a time to talk?', 'Yes. On the Support page ask for a session at a time that suits you. We confirm by email and it happens in the chat. Free accounts can book 1 a month and Beta accounts 4.'],
      ['How fast do you reply?', 'Most messages get a reply within a few hours on working days. The chat shows when we have answered, and we email you if you are away.'],
      ['I want to report a wrong lesson or a bug.', 'Use the feedback or report button on the lesson, or write in the Support chat with the topic name and what looked wrong.'],
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy and your data',
    items: [
      ['What do you store about me?', 'Your account details, courses, lessons you studied, answers and study time, and payment records. See the Privacy policy for the full list.'],
      ['Who can see my courses and progress?', 'Only you, unless you make your profile public. The team’s support view shows a short code and your plan, not your name, email or phone.'],
      ['Are ads personalised?', 'Only if you choose “personalised ads” in the cookie notice or Settings. Beta and Beta Plus show no ads.'],
      ['Can I turn off emails?', 'Yes, in Settings, Emails. Product news can be switched off or unsubscribed with one click. Receipts, security and plan-ending notices are always sent.'],
      ['Can I download or delete my data?', 'Yes. Settings has a download of everything held about you, and a delete option for your account.'],
      ['Is my payment information safe?', 'Payments are made on Razorpay’s hosted page, so card and bank details never touch our servers.'],
    ],
  },
  {
    id: 'trouble',
    title: 'Troubleshooting',
    items: [
      ['The page will not load or keeps spinning.', 'Check your internet connection, refresh, and try again. If you are on a VPN or proxy, turn it off, since some features pause for VPN traffic.'],
      ['I see “You have reached today’s limit”.', 'Some features have daily limits that reset at midnight India time. The usage card in Settings shows where you stand. Beta raises most limits.'],
      ['“Your next free lesson is not open yet”.', 'That was the old pacing rule. Free now has unlimited learning sessions, so refresh the page, and write to Support if it still appears.'],
      ['Sign-in says my email and password do not match.', 'Check caps lock and the email spelling, or reset your password. After many failed tries the account waits a few minutes before another attempt.'],
      ['The upload bar does not finish.', 'Keep the page open and check your connection. Files over 5 MB are rejected, and PDFs without selectable text may produce no topics. Try pasting the text.'],
      ['Sound or narration does not play.', 'Turn on spoken narration in the classroom and check the device is not muted. Voices come from your browser, so quality depends on the device.'],
      ['My progress looks wrong on another device.', 'Courses sync from your account. Sign in on both, refresh, and wait a moment. Study time recorded while offline is added when you reconnect.'],
    ],
  },
];

export const FAQ_COUNT = FAQ.reduce((n, g) => n + g.items.length, 0);
