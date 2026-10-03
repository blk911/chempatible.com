// Original Duhwild conversation choices. These rounds do not score a psychological
// instrument, diagnose a type, or predict compatibility. Never shorten a scored
// instrument and label its partial result as a completed assessment.
export const REWARDS=['Send an introduction','Mutual phone exchange','Getting closer status','Opt-in discovery photo','15-second video intro'];
const q=(id,text,labels)=>({id,text,choices:labels.map((label,value)=>({value,label}))});
export const REWARD_ROUNDS=[
 {level:2,title:'Second five',reward:REWARDS[1],questions:[
 q('base-6','You’ve had a rough day. How do you let someone close to you know?',['“I could use some company.”','“I need a little time, then let’s talk.”','I tend to keep it to myself.']),
 q('base-7','You’re beginning to care about someone. What feels most important?',['Feeling safe enough to be honest.','Keeping room for our own lives.','Seeing steady actions, not just words.']),
 q('base-8','They text while you’re swamped. What do you usually do?',['Send a quick “busy, talk soon.”','Wait until I can give a real answer.','Reply when my day is done.']),
 q('base-9','They want something from a relationship that you don’t. What comes first?',['Ask why it matters to them.','Explain my own limit clearly.','Take time to decide whether we fit.']),
 q('base-10','You made plans, then something better comes up. What do you do?',['Keep our plans.','Ask if changing plans would be okay.','Suggest another time.'])]},
 {level:3,title:'Next five',reward:REWARDS[2],questions:[
 q('r3-1','What makes a new connection feel worth another conversation?',['Easy laughter.','Thoughtful questions.','Feeling comfortable in the quiet.']),
 q('r3-2','How would you most enjoy learning something new together?',['Try it and see what happens.','Plan a little, then try.','Watch someone show us first.']),
 q('r3-3','What is your favorite kind of small surprise?',['A spontaneous outing.','Something personal someone remembered.','A thoughtful message.']),
 q('r3-4','When a plan changes, what helps you adjust?',['Knowing the new plan.','Having a few choices.','A little time to reset.']),
 q('r3-5','Which ordinary moment would you most like to share?',['Cooking something simple.','A walk with no agenda.','A favorite song or story.'])]},
 {level:4,title:'Next five',reward:REWARDS[3],questions:[
 q('r4-1','What would you like a new person to notice about you?',['My sense of humor.','My curiosity.','My care for the people around me.']),
 q('r4-2','Which conversation would make you want to linger?',['Something neither of us knows yet.','A story from everyday life.','What we each hope to try.']),
 q('r4-3','How do you like a first meeting to feel?',['Light and spontaneous.','Simple and familiar.','A little adventurous.']),
 q('r4-4','What helps you feel like yourself around someone new?',['Having room to be playful.','Having time to settle in.','Talking about a shared interest.']),
 q('r4-5','Which part of your life would you enjoy introducing first?',['A place I love.','A hobby I return to.','A small daily ritual.'])]},
 {level:5,title:'Next five',reward:REWARDS[4],questions:[
 q('r5-1','What tone would you choose for a quick hello?',['Warm and relaxed.','Playful and light.','Curious and direct.']),
 q('r5-2','What would you most enjoy inviting someone to ask about?',['Something I am learning.','A story that makes me laugh.','A place I want to go.']),
 q('r5-3','What makes an introduction feel genuine to you?',['A specific little detail.','A natural voice.','A thoughtful question.']),
 q('r5-4','When would you prefer to record a short introduction?',['After thinking about what to say.','In a spontaneous good moment.','After trying a couple of versions.']),
 q('r5-5','What would you most like your hello to leave room for?',['A question back.','A shared laugh.','A conversation at our own pace.'])]}
];
export function getRewardRound(level){return REWARD_ROUNDS.find(r=>r.level===level)||null}
export function validRewardAnswers(round,answers,complete=false){
 if(!round||!answers||typeof answers!=='object'||Array.isArray(answers)||![Object.prototype,null].includes(Object.getPrototypeOf(answers)))return false;
 const ids=new Set(round.questions.map(q=>q.id)),keys=Reflect.ownKeys(answers);
 return (!complete||keys.length===5)&&keys.every(k=>typeof k==='string'&&ids.has(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(answers,k),'value')&&Number.isInteger(answers[k])&&answers[k]>=0&&answers[k]<=2);
}
