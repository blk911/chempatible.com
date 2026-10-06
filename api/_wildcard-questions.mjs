// Original, unscored conversation starters. These are not assessment items or
// compatibility predictions. Keep IDs stable: a question can be asked only once
// by either person in a connection, even if its wording is edited later.
export const WILDCARD_LIMIT=3;
const category=(id,title,texts)=>({id,title,questions:texts.map((text,index)=>({id:`wc-${id}-${index+1}`,text}))});
export const WILDCARD_CATEGORIES=[
 category('everyday','Everyday life',[
  'What small thing can turn an ordinary day around for you?',
  'What does a really good slow morning look like for you?',
  'Which daily ritual would you enjoy sharing with someone?',
  'What is your favorite way to unwind after a full day?',
  'What is something about your neighborhood you would love to show me?',
  'Which meal could you happily make or eat again and again?'
 ]),
 category('play','Fun and adventure',[
  'What would you choose for a spontaneous afternoon together?',
  'What is something you would like to try for the first time?',
  'What kind of adventure feels like just the right amount of daring?',
  'What always makes you laugh, even on a difficult day?',
  'Which song would you put on for a little road trip?',
  'What is a playful talent or hobby you would like to teach me?'
 ]),
 category('values','What matters',[
  'What is a small act of kindness you still remember?',
  'What do you make time for even when life gets busy?',
  'What quality do you appreciate most in the people close to you?',
  'What is something you have changed your mind about recently?',
  'What helps you feel proud of how you spent your day?',
  'What does being thoughtful toward each other look like to you?'
 ]),
 category('closer','Feeling close',[
  'What helps you feel comfortable getting to know someone?',
  'How do you like someone to show they are listening?',
  'What kind of small gesture makes you feel appreciated?',
  'How do you like to balance time together and time to yourself?',
  'What helps a conversation feel easy and honest for you?',
  'What is a low-pressure way you would enjoy spending time together?'
 ]),
 category('ahead','Looking ahead',[
  'What is something you are looking forward to this season?',
  'What would you enjoy learning with someone beside you?',
  'What is one little tradition you would like to start?',
  'What place would you like to explore at an unhurried pace?',
  'What would you like to make more room for in your life?',
  'What would make our next conversation something to look forward to?'
 ])
];
const questions=new Map(WILDCARD_CATEGORIES.flatMap(c=>c.questions.map(q=>[q.id,{...q,categoryId:c.id}])));
export const getWildcardQuestion=id=>typeof id==='string'?questions.get(id)||null:null;
