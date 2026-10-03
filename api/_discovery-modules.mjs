/**
 * Versioned discovery content and pure, server-owned scoring.
 *
 * Feel Loved and Closeness Reflection are original Duh Wild content, written
 * for this project. They are not adaptations of proprietary questionnaires,
 * validated psychological instruments, attachment classifications, or a
 * compatibility model. Their dimensions are conversation prompts, not norms.
 * Mini-IPIP uses the public-domain IPIP items and published scoring key; its
 * item text is not original Duh Wild content. Verified sources are retained
 * on that module. No population norms or relationship-fit claims are applied.
 * Existing versions must not be edited after answers have been collected:
 * add a new version instead so a saved answer always retains its meaning.
 */

const AGREEMENT_SCALE = [
  {value:1,label:'Strongly disagree'},
  {value:2,label:'Disagree'},
  {value:3,label:'Neither agree nor disagree'},
  {value:4,label:'Agree'},
  {value:5,label:'Strongly agree'}
];
const ACCURACY_SCALE = [
  {value:1,label:'Very inaccurate'},
  {value:2,label:'Moderately inaccurate'},
  {value:3,label:'Neither inaccurate nor accurate'},
  {value:4,label:'Moderately accurate'},
  {value:5,label:'Very accurate'}
];
const ORIGINAL_PROVENANCE = 'Original Duh Wild self-reflection content created for this project; not a validated psychological questionnaire.';
const REFLECTION_CAUTION = 'This is a snapshot of your own responses, not a diagnosis, fixed type, or compatibility score. There is no best result, and preferences can change with context.';

function freezeDeep(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freezeDeep(child);
  return Object.freeze(value);
}

export const MODULES = freezeDeep([
  {
    id:'affection-preferences',version:'1',title:'Feel Loved',
    description:'Explore the everyday moments that help affection land for you. Think about what feels true for you lately.',
    provenance:ORIGINAL_PROVENANCE,caution:REFLECTION_CAUTION,scale:AGREEMENT_SCALE,
    dimensions:[
      {id:'personal-details',label:'Personal details',description:'Care that connects to the small, specific things someone knows about you.'},
      {id:'shared-playfulness',label:'Shared playfulness',description:'Affection expressed through humor, lightness, and little moments of fun.'},
      {id:'steady-signals',label:'Steady signals',description:'Small, recurring reminders of care woven into everyday life.'},
      {id:'shared-curiosity',label:'Shared curiosity',description:'Feeling connected by exploring interests and discovering things together.'},
      {id:'low-key-presence',label:'Low-key presence',description:'Comfortable togetherness without needing a big occasion or constant activity.'}
    ],
    questions:[
      {id:'affection-01',text:'I feel cared for when someone remembers a small detail about what I enjoy.',dimension:'personal-details'},
      {id:'affection-02',text:'A shared joke can make an ordinary day feel more connected.',dimension:'shared-playfulness'},
      {id:'affection-03',text:'Small reminders of care throughout the week mean a lot to me.',dimension:'steady-signals'},
      {id:'affection-04',text:'I feel close to someone when we explore a new interest together.',dimension:'shared-curiosity'},
      {id:'affection-05',text:'Doing separate activities in the same room can feel affectionate to me.',dimension:'low-key-presence'},
      {id:'affection-06',text:'A gesture feels warmer to me when it connects to something specific I have shared.',dimension:'personal-details'},
      {id:'affection-07',text:'Being silly together is one way I enjoy giving and receiving affection.',dimension:'shared-playfulness'},
      {id:'affection-08',text:'I enjoy having a small, familiar ritual that reminds us of each other.',dimension:'steady-signals'},
      {id:'affection-09',text:'Someone taking a genuine interest in what fascinates me makes me feel appreciated.',dimension:'shared-curiosity'},
      {id:'affection-10',text:'Quiet company can make me feel connected even when we are not talking.',dimension:'low-key-presence'}
    ]
  },
  {
    id:'closeness-reflection',version:'1',title:'Closeness Reflection',
    description:'Reflect on the pace, contact, and personal space you enjoy in a connection. Answer for yourself, with no right or wrong pattern.',
    provenance:ORIGINAL_PROVENANCE,caution:REFLECTION_CAUTION,scale:AGREEMENT_SCALE,
    dimensions:[
      {id:'gradual-disclosure',label:'Gradual sharing',description:'A preference for sharing personal stories gradually as a connection develops.'},
      {id:'familiar-contact',label:'Familiar contact',description:'A preference for a recognizable rhythm of contact and time together.'},
      {id:'independent-space',label:'Independent space',description:'Valuing personal interests and time on your own alongside connection.'},
      {id:'shared-routines',label:'Shared routines',description:'Enjoying everyday activities as a way of building a sense of togetherness.'},
      {id:'explicit-reassurance',label:'Clear reassurance',description:'Appreciating direct expressions of being wanted and included.'}
    ],
    questions:[
      {id:'closeness-01',text:'I prefer to share personal stories a little at a time as I get to know someone.',dimension:'gradual-disclosure'},
      {id:'closeness-02',text:'Knowing roughly when we will next spend time together helps me feel settled in a connection.',dimension:'familiar-contact'},
      {id:'closeness-03',text:'Keeping some hobbies just for myself is important to me, even in a close connection.',dimension:'independent-space'},
      {id:'closeness-04',text:'Sharing ordinary routines helps me feel that someone is part of my life.',dimension:'shared-routines'},
      {id:'closeness-05',text:'I appreciate hearing directly that someone enjoys having me in their life.',dimension:'explicit-reassurance'},
      {id:'closeness-06',text:'I prefer to share personal details early rather than gradually in a new connection.',dimension:'gradual-disclosure',reverse:true},
      {id:'closeness-07',text:'I enjoy contact that has a familiar rhythm.',dimension:'familiar-contact'},
      {id:'closeness-08',text:'Time spent on my own helps me enjoy time together.',dimension:'independent-space'},
      {id:'closeness-09',text:'I like including someone close to me in small, everyday activities.',dimension:'shared-routines'},
      {id:'closeness-10',text:'Clear words of welcome help me feel included in someone’s plans.',dimension:'explicit-reassurance'}
    ]
  },
  {
    id:'mini-ipip-20',version:'1',title:'Big Five Snapshot',
    description:'The 20-item Mini-IPIP explores five broad personality tendencies. Rate how accurately each statement describes you generally, rather than how you wish to be.',
    provenance:'Public-domain International Personality Item Pool (IPIP) items, selected for the Mini-IPIP by Donnellan, Oswald, Baird, and Lucas (2006). Item order and reverse keys follow their appendix. Scores are raw self-report sums, not population percentiles.',
    sources:[
      {title:'IPIP public-domain permission',url:'https://ipip.ori.org/newPermission.htm'},
      {title:'Official Mini-IPIP items and scoring key',url:'https://www.ipip.ori.org/MiniIPIPKey.htm'},
      {title:'IPIP response options and scoring instructions',url:'https://ipip.ori.org/newScoringInstructions.htm'},
      {title:'Donnellan et al. (2006), Mini-IPIP publication',url:'https://pubmed.ncbi.nlm.nih.gov/16768595/'},
      {title:'Original paper and 20-item appendix',url:'https://faracivisiting.wordpress.com/wp-content/uploads/2010/04/donnellan-et-al-2006.pdf'}
    ],
    caution:'This brief self-report is not a diagnosis, a fixed personality type, or a compatibility score. Scores are not percentiles, and a higher score is not necessarily better. A short scale gives only a limited snapshot.',
    scale:ACCURACY_SCALE,
    dimensions:[
      {id:'extraversion',label:'Extraversion',description:'Self-reported engagement and talkativeness in social situations.'},
      {id:'agreeableness',label:'Agreeableness',description:'Self-reported attention and responsiveness to other people’s feelings.'},
      {id:'conscientiousness',label:'Conscientiousness',description:'Self-reported preference for order and completing everyday responsibilities.'},
      {id:'neuroticism',label:'Neuroticism',description:'Self-reported tendency toward shifting moods and unpleasant emotions. This personality-trait label does not indicate a mental health condition.'},
      {id:'intellect-imagination',label:'Intellect / Imagination',description:'Self-reported interest in imagination and abstract ideas. This is not an intelligence test.'}
    ],
    questions:[
      {id:'mini-ipip-01',text:'Am the life of the party.',dimension:'extraversion'},
      {id:'mini-ipip-02',text:"Sympathize with others' feelings.",dimension:'agreeableness'},
      {id:'mini-ipip-03',text:'Get chores done right away.',dimension:'conscientiousness'},
      {id:'mini-ipip-04',text:'Have frequent mood swings.',dimension:'neuroticism'},
      {id:'mini-ipip-05',text:'Have a vivid imagination.',dimension:'intellect-imagination'},
      {id:'mini-ipip-06',text:"Don't talk a lot.",dimension:'extraversion',reverse:true},
      {id:'mini-ipip-07',text:"Am not interested in other people's problems.",dimension:'agreeableness',reverse:true},
      {id:'mini-ipip-08',text:'Often forget to put things back in their proper place.',dimension:'conscientiousness',reverse:true},
      {id:'mini-ipip-09',text:'Am relaxed most of the time.',dimension:'neuroticism',reverse:true},
      {id:'mini-ipip-10',text:'Am not interested in abstract ideas.',dimension:'intellect-imagination',reverse:true},
      {id:'mini-ipip-11',text:'Talk to a lot of different people at parties.',dimension:'extraversion'},
      {id:'mini-ipip-12',text:"Feel others' emotions.",dimension:'agreeableness'},
      {id:'mini-ipip-13',text:'Like order.',dimension:'conscientiousness'},
      {id:'mini-ipip-14',text:'Get upset easily.',dimension:'neuroticism'},
      {id:'mini-ipip-15',text:'Have difficulty understanding abstract ideas.',dimension:'intellect-imagination',reverse:true},
      {id:'mini-ipip-16',text:'Keep in the background.',dimension:'extraversion',reverse:true},
      {id:'mini-ipip-17',text:'Am not really interested in others.',dimension:'agreeableness',reverse:true},
      {id:'mini-ipip-18',text:'Make a mess of things.',dimension:'conscientiousness',reverse:true},
      {id:'mini-ipip-19',text:'Seldom feel blue.',dimension:'neuroticism',reverse:true},
      {id:'mini-ipip-20',text:'Do not have a good imagination.',dimension:'intellect-imagination',reverse:true}
    ]
  }
]);

/** Unknown IDs or exact versions return null; omitted version selects latest. */
export function getModule(id, version) {
  if (typeof id !== 'string' || (version !== undefined && typeof version !== 'string')) return null;
  return [...MODULES].reverse().find(module => module.id === id && (version === undefined || module.version === version)) || null;
}

/** Accept ordinary JSON objects and null-prototype records, never accessors. */
function answerDescriptors(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  const prototype = Object.getPrototypeOf(answers);
  if (prototype !== Object.prototype && prototype !== null) return null;
  return Object.getOwnPropertyDescriptors(answers);
}

/**
 * A draft may be empty or incomplete. A completed submission must contain every
 * question exactly once. Unknown keys (including prototype and symbol keys),
 * inherited values, getters, hidden properties, and coerced numbers are refused.
 */
export function validateAnswers(module, answers, {complete=false}={}) {
  try {
    if (!MODULES.includes(module) || typeof complete !== 'boolean') return false;
    const descriptors = answerDescriptors(answers);
    if (!descriptors) return false;
    const keys = Reflect.ownKeys(descriptors);
    const questionIds = new Set(module.questions.map(question => question.id));
    if (complete && keys.length !== questionIds.size) return false;
    return keys.every(key => {
      const descriptor = descriptors[key];
      return typeof key === 'string' && questionIds.has(key) && descriptor.enumerable &&
        Object.hasOwn(descriptor,'value') && Number.isInteger(descriptor.value) &&
        descriptor.value >= 1 && descriptor.value <= 5;
    });
  } catch {
    return false;
  }
}

/**
 * Raw keyed sums, never percentiles or a combined fit score. Missing responses
 * are omitted, not zero-filled. The denominator counts only answered items, so
 * a partial dimension never masquerades as a low rating. Declaration order is
 * stable, including ties. Call validateAnswers(..., {complete:true}) before
 * publishing a finished result.
 */
export function scoreAnswers(module, answers) {
  if (!validateAnswers(module,answers)) throw new TypeError('Invalid discovery module or answers.');
  const descriptors = answerDescriptors(answers);
  const answeredCount = Reflect.ownKeys(descriptors).length;
  const dimensions = module.dimensions.flatMap(dimension => {
    const questions = module.questions.filter(question => question.dimension === dimension.id);
    const answered = questions.filter(question => Object.hasOwn(descriptors,question.id));
    if (!answered.length) return [];
    const score = answered.reduce((sum,question) => {
      const value = descriptors[question.id].value;
      return sum + (question.reverse ? 6-value : value);
    },0);
    const maxScore = answered.length*5;
    return [{
      id:dimension.id,label:dimension.label,score,maxScore,
      description:`${dimension.description} Average self-rating: ${(score/answered.length).toFixed(1)} of 5, based on ${answered.length} of ${questions.length} statements.`
    }];
  });
  const summary = answeredCount === 0
    ? 'No responses yet. Answer a few statements to begin your reflection.'
    : answeredCount < module.questions.length
      ? `Partial reflection: ${answeredCount} of ${module.questions.length} statements answered. These summaries use only your answered statements; complete the rest for the full snapshot.`
      : `You answered all ${module.questions.length} statements. These summaries describe your self-reported preferences and tendencies. Use them as conversation starters; no combination is best.`;
  return {summary,dimensions,caution:module.caution || REFLECTION_CAUTION};
}
