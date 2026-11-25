import type { Asked } from "@/components/flow-lab/asks";
import { paceAsked, type Pace } from "@/components/flow-lab/pace";

/**
 * What is asked, for the records the design pages play back that were made without being asked anything (a world
 * opened from a setting, or made before questions were asked): written by hand for each, so that the questions and
 * the pace can be looked at on any of them, and nothing is spent. Each asks only of the thing itself, what it
 * concretely is, as the questions really do. `pace` is the last thing asked, written for that world; a record that
 * has its own questions is given only that (its own pace was never asked either).
 */
type Sample = { clarify?: Asked[]; pace: Pace[] };

const Q = "How closely do you want to watch this world?";
export const PACE_Q = Q;

const one = (q: string, options: string[]): Asked => ({ q, kind: "one", options });
const many = (q: string, options: string[]): Asked => ({ q, kind: "many", options });
const num = (q: string, unit: string, options: string[]): Asked => ({ q, kind: "number", unit, options });
const p = (name: string, step: string, steps: number, minutes: number): Pace => ({ name, step, steps, minutes });

/** Raising money in Silicon Valley: the same shape for every record of it. */
const raise = (what: string): Pace[] => [
  p("Every exchange", `Each email, each meeting, each reply is a step: ${what}`, 130, 140),
  p("Every turn", "A step is when things change direction: getting the first interview, someone agreeing to lead the round, someone saying no.", 34, 32),
  p("Every round", "A step is a round of applications or of investor meetings completed: the application deadline, interview week, Demo Day.", 12, 11),
  p("Only the ending", "Only what changes everything is a step: whether this round is raised before the money runs out.", 4, 4),
];

export const DESIGN_ASKS: Record<string, Sample> = {
  // ---- records that have their own questions: only the pace
  world_o2dj8euk6zr7: {
    pace: [
      p("Every exchange", "Each conversation, each reply, each decision is a step: an investor writing back to ask you for coffee in Palo Alto on Thursday is one step.", 140, 150),
      p("Every turn", "A step is when things change direction: the first paying customer, an angel agreeing to lead the round, a co-founder saying they want to leave.", 36, 32),
      p("Every stretch of time", "A step is when a stretch of days comes to a close: the visa coming through, moving into the first office, the end of the first round of pitches.", 14, 12),
      p("Only the big moments", "Only what changes everything is a step: whether the round closes as the money is about to run out.", 5, 4),
    ],
  },
  world_yhljq8hvul8w: {
    pace: [
      p("Every visit", "Each consultation, each test, each payment is a step: the vet suggesting an X-ray before the blood test is one step.", 60, 55),
      p("Every turn", "A step is when the illness or the cost changes direction: finding the cause, whether to operate, the money about to go over budget.", 18, 16),
      p("Every day", "A step is a day gone by: the first day in hospital, the second, the day the dog comes home.", 9, 8),
      p("Only the result", "Only what changes everything is a step: whether the dog is well by the time the 10,000 is spent.", 3, 3),
    ],
  },
  world_hksx1tqfepid: { pace: raise("a partner reading the deck and writing back to set up a video call next Tuesday is one step.") },

  // ---- records made without being asked
  world_oefjkbw2gfoj: {
    clarify: [
      one("How many people are you taking from Apple?", ["None", "Two or three core engineers", "About five, in sales and engineering", "More"]),
      num("How much of your own money are you putting into the new company?", "million dollars", ["2", "7", "12"]),
      one("Who will the first workstations be sold to?", ["University and research labs", "Universities and government research bodies", "Corporate R&D departments", "Not decided yet"]),
      one("Is there a risk of a non-compete claim or a lawsuit from Apple?", ["Already being sued", "Apple is thinking of suing", "No", "Not sure"]),
    ],
    pace: [
      p("Every meeting", "Each negotiation, each phone call, each design review is a step: a Carnegie Mellon professor coming to see the prototype is one step.", 120, 130),
      p("Every turn", "A step is when things change direction: Apple suing, the first outside investment, a new chip supplier.", 32, 30),
      p("Every quarter", "A step is a quarter gone by: the prototype finished, the first machines delivered, the year-end accounts.", 12, 10),
      p("Only the big moments", "Only what changes everything is a step: whether the machine sells once it is on the market.", 4, 4),
    ],
  },
  world_57c6vs1q63su: {
    clarify: [
      one("Where in Xihu District will the shop be?", ["Around Wensan Road and Xueyuan Road", "Around Huanglong and Xixi Road", "On the ground floor of an old housing estate", "Still looking"]),
      num("Roughly how big is the shop?", "m²", ["30", "60", "100"]),
      many("What does the 300,000 mainly need to cover?", ["Rent and deposit", "Fit-out", "The coffee machine and other equipment", "The first few months of wages", "Marketing for the opening"]),
      one("Who will make the coffee?", ["Me", "An experienced barista", "Me and a part-timer", "Not sure yet"]),
    ],
    pace: [
      p("Every customer", "Each sale, each delivery of stock, each talk with the landlord is a step: the first returning customer on a Saturday morning is one step.", 150, 160),
      p("Every turn", "A step is when the business changes direction: a chain opening across the street, a post about the shop on Xiaohongshu, new beans.", 30, 28),
      p("Every month", "A step is a month gone by: the first month open, the profit or loss of the third month, the month the lease is renewed.", 12, 10),
      p("Only the big moments", "Only what changes everything is a step: whether it pays for itself before the money runs out.", 4, 4),
    ],
  },
  world_74il36e406cb: {
    clarify: [
      num("How many restaurants are trying it now?", "restaurants", ["3", "8", "20"]),
      one("Are any of the restaurants trying it willing to pay?", ["None", "They say they would", "One or two are talking about a price", "Someone has already paid"]),
      one("What currency is the 3 million in, and how much of the company are you selling?", ["Yuan, about 10%", "Yuan, about 15%", "Dollars, the share not decided", "Haven't thought about it"]),
      many("Where will the 10 angel investors come from?", ["Introductions from friends", "Former colleagues or bosses", "Cold emails", "Incubators or events", "No list yet"]),
    ],
    pace: [
      p("Every meeting", "Each pitch, each reply, each follow-up question is a step: the third angel asking how many of your restaurants stay is one step.", 110, 115),
      p("Every turn", "A step is when things change direction: someone offering terms, a restaurant starting to pay, someone saying it is too early.", 28, 26),
      p("Every week", "A step is a week gone by: having met the first three, the first letter of intent.", 10, 9),
      p("Only the ending", "Only what changes everything is a step: whether this round closes before the money runs out.", 4, 4),
    ],
  },
  world_o0xb9l4w8pxb: {
    clarify: [
      one("What does the family live on?", ["Farming their own land", "Farm work for others", "The father working in the city and sending money home", "A small shop or trade"]),
      one("How many years of school did the mother have?", ["None", "Finished primary school", "Finished middle school", "Went to high school"]),
      one("Where is the child born?", ["At home", "The village health post", "The public hospital in town", "A private hospital in the city"]),
    ],
    pace: [
      p("Every little thing", "Each illness, each day at school, each quarrel at home is a step: being taken to the town with a fever at three is one step.", 160, 170),
      p("Every turn", "A step is when a life changes direction: whether to go on to secondary school, whether the father goes to work in the Gulf, whether to marry early.", 36, 34),
      p("Every year", "A step is a year gone by: the year school starts, the year of the first trip to the city.", 18, 16),
      p("Only the big moments", "Only what changes a whole life is a step: schooling, work and marriage are each one step.", 6, 5),
    ],
  },
  world_xtigebyxmk9o: {
    clarify: [
      one("From birth to when?", ["Stop at adulthood", "To forty", "All the way to old age", "Until I say stop"]),
      one("Should the place of birth be completely random?", ["Completely random, by population", "Random, but tell me the country first", "I want to choose a continent"]),
    ],
    pace: [
      p("Every little thing", "Each illness, each exam, each move is a step: leaving the village for the first time at five is one step.", 160, 170),
      p("Every turn", "A step is when a life changes direction: leaving school or going on, leaving home, meeting someone who changes everything.", 36, 34),
      p("Every year", "A step is a year gone by: the most important thing that happened each year.", 20, 18),
      p("Only the big moments", "Only what changes a whole life is a step: schooling, work, marriage and growing old are each one step.", 6, 5),
    ],
  },
  world_txt2kbrvzdyb: {
    clarify: [
      many("Which issues are going to arbitration?", ["Unpaid wages", "No signed employment contract", "Overtime pay", "Unlawful dismissal, or being pushed out", "Social insurance not fully paid"]),
      num("How long have you worked at this company?", "years", ["1", "3", "6"]),
      many("What evidence do you already have?", ["The employment contract", "Wage records", "Attendance or clock-in records", "Chats and emails", "Not sorted yet"]),
      one("Does the company know you are going to arbitration?", ["Not yet", "They have noticed", "We have talked once", "The company came to talk to me first"]),
    ],
    pace: [
      p("Every encounter", "Each conversation, each document, each hearing is a step: HR asking to see you alone this afternoon is one step.", 70, 65),
      p("Every turn", "A step is when things change direction: the company offering to settle, the arbitration commission taking the case, the hearing put off.", 20, 18),
      p("Every stage", "A step is a stage completed: filing, the hearing, the award.", 8, 7),
      p("Only the result", "Only what changes everything is a step: how much you get in the end.", 3, 3),
    ],
  },
  world_ixzzn67kcj0y: {
    clarify: [
      many("Which parts will the shop have?", ["Pet supplies retail", "Grooming", "Boarding", "Pet café or food", "Veterinary care"]),
      num("What is the total budget for opening the shop?", "million yuan", ["1.5", "3", "5"]),
      one("If it is all run by staff, who is the manager?", ["A manager is already found", "Hiring one away from a competitor", "Hiring now", "Have not started looking"]),
      one("What rent was agreed with Kerry Centre?", ["Fixed rent", "A minimum plus a share of sales", "A share of sales only", "Still negotiating"]),
    ],
    pace: [
    p("Every task", "Each delivery of stock, each customer, each staff rota is a step: the manager taking the weekend off is one step.", 130, 140),
    p("Every turn", "A step is when the business changes direction: the manager quitting, the mall moving shops between floors, grooming starting to make money.", 30, 28),
    p("Every month", "A step is a month gone by: the first month open, the six-month review, the month the lease is renewed.", 12, 10),
    p("Only the big moments", "Only what changes everything is a step: whether it breaks even after a year.", 4, 4),
    ],
  },
  world_0sim0qcz0l0o: {
    clarify: [
      num("How many stars does the project have now?", "stars", ["0", "500", "3000"]),
      one("What runs now?", ["Only an idea", "A demo that runs", "A first version people can use", "People are already using it"]),
      many("Where do you plan to promote it?", ["Hacker News", "Reddit", "X / Twitter", "Xiaohongshu and Jike", "GitHub Trending"]),
      one("How many people are working on it?", ["Just me", "Two or three", "A small team", "An open-source community"]),
    ],
    pace: [
      p("Every release", "Each commit, each post, each comment is a step: a big account sharing your demo is one step.", 120, 125),
      p("Every turn", "A step is when the attention changes direction: making Trending, being called out, a big company taking notice.", 30, 28),
      p("Every week", "A step is a week gone by: the stars of each week and the biggest thing that happened.", 26, 22),
      p("Only the big moments", "Only what changes everything is a step: whether it has fifty thousand after six months.", 4, 4),
    ],
  },
  world_i2gu7f2fwiyt: {
    clarify: [
      num("How many subscribers does the podcast have now?", "subscribers", ["2000", "20000", "200000"]),
      one("What language is the podcast in?", ["Chinese", "English", "Chinese and English"]),
      many("Which connections can you use?", ["No direct connection at all", "I know people at Tesla or SpaceX", "I know investors close to Musk", "I have been on other big podcasts"]),
    ],
    pace: [
    p("Every attempt", "Each email, each tweet, each request for an introduction is a step: Musk replying to one of your tweets is one step.", 110, 115),
    p("Every turn", "A step is when things change direction: someone willing to introduce you, the show suddenly taking off, being turned down by an assistant.", 28, 26),
    p("Every month", "A step is a month gone by: how much closer to him you got each month.", 12, 10),
    p("Only the ending", "Only what changes everything is a step: whether the interview happens in the end.", 3, 3),
    ],
  },
  world_wiskzubu2vaz: {
    clarify: [
      num("How many subscribers does the podcast have now?", "subscribers", ["2000", "20000", "200000"]),
      one("What kind of interview do you want?", ["In person", "Over video", "A short interview at one of his events", "Any of these"]),
      one("By when at the latest do you want it done?", ["Within three months", "Within six months", "Within a year", "No deadline"]),
    ],
    pace: [
    p("Every attempt", "Each email, each tweet, each request for an introduction is a step: Musk replying to one of your tweets is one step.", 110, 115),
    p("Every turn", "A step is when things change direction: someone willing to introduce you, the show suddenly taking off, being turned down by an assistant.", 28, 26),
    p("Every month", "A step is a month gone by: how much closer to him you got each month.", 12, 10),
    p("Only the ending", "Only what changes everything is a step: whether the interview happens in the end.", 3, 3),
    ],
  },
  world_pjjbfv8y4oxa: {
    clarify: [
      many("Which parts will the shop have?", ["Pet supplies retail", "Grooming", "Boarding", "Pet café or food", "Veterinary care"]),
      num("What is the total budget for opening the shop?", "million yuan", ["2", "4", "6"]),
      one("Who will run the shop?", ["Me, full time", "Me on the big picture, with a manager", "All run by staff", "A partner"]),
    ],
    pace: [
    p("Every task", "Each delivery of stock, each customer, each staff rota is a step: the manager taking the weekend off is one step.", 130, 140),
    p("Every turn", "A step is when the business changes direction: the manager quitting, the mall moving shops between floors, grooming starting to make money.", 30, 28),
    p("Every month", "A step is a month gone by: the first month open, the six-month review, the month the lease is renewed.", 12, 10),
    p("Only the big moments", "Only what changes everything is a step: whether it breaks even after a year.", 4, 4),
    ],
  },
  world_s2m3qljqbjib: {
    clarify: [
      one("Which gold price do you mean?", ["London spot gold (dollars an ounce)", "New York COMEX futures", "Shanghai gold (yuan a gram)"]),
      one("“Fall” over how long?", ["A week after the election", "A month after the election", "By the end of the year", "The first half of next year"]),
      one("Do you hold any gold?", ["No, I just want to know", "Physical gold", "A gold ETF or futures", "About to buy"]),
    ],
    pace: [
      p("Every day", "Each trading day is a step: the market on the day the election result comes out is one step.", 60, 50),
      p("Every turn", "A step is when the market changes direction: the result confirmed, the Fed speaking, a conflict abroad growing.", 16, 14),
      p("Every week", "A step is a week gone by: each week's rise or fall and the most important news.", 9, 8),
      p("Only the result", "Only what changes everything is a step: whether gold is up or down when the time is up.", 3, 3),
    ],
  },
  world_12tdy511clso: {
    clarify: [
      one("Which year's Worlds?", ["2026", "2027", "Any year"]),
      one("In what role does Otto take part?", ["Pro player", "Substitute or on trial", "Coach", "Only a what-if"]),
    ],
    pace: [
      p("Every game", "Each game is a step: meeting the LCK's first seed on the second day of the group stage is one step.", 70, 70),
      p("Every turn", "A step is when the situation changes direction: a patch, a change in the roster, a comeback in a key game.", 20, 18),
      p("Every stage", "A step is a stage completed: the play-ins, the group stage, the knockouts.", 7, 6),
      p("Only the result", "Only what changes everything is a step: whether they win the title in the end.", 3, 3),
    ],
  },
  world_7bfyxkekbxm7: {
    clarify: [
      one("Which company do you mean?", ["Lehman Brothers (September 2008)", "Another company heading for bankruptcy", "My own company"]),
      one("Who are you in this?", ["The CEO, with the final say", "A board member", "A major shareholder", "An onlooker"]),
      one("What is hardest to accept in Barclays' terms?", ["The price is too low", "It will not take the bad assets", "It needs a government guarantee", "There is too little time"]),
    ],
    pace: [
      p("Every call", "Each phone call, each board meeting, each term sheet is a step: the Treasury calling in the small hours of Saturday is one step.", 90, 95),
      p("Every turn", "A step is when the situation changes direction: Barclays changing its price, the British regulator taking a position, the Fed refusing a guarantee.", 22, 20),
      p("Every day", "A step is a day gone by: each day of that weekend.", 6, 5),
      p("Only the ending", "Only what changes everything is a step: whether the deal is done before Monday's open.", 2, 2),
    ],
  },
  world_mqj1pyrw52r3: {
    clarify: [
      one("How far along is the product?", ["Only a deck", "A demo that can be shown", "Beta users", "Already making money"]),
      one("How many people are on the team?", ["Just me", "Two co-founders", "Three to five"]),
      num("How much do you want to raise this round?", "thousand dollars", ["500", "1500", "3000"]),
      one("Where are you now?", ["In China", "Already in the Bay Area", "Elsewhere in the US"]),
    ],
    pace: raise("a YC partner asking about your number of users in the application is one step."),
  },
  world_rxg3evgaylpg: {
    clarify: [
      many("Which accelerators do you plan to apply to?", ["YC", "a16z speedrun", "Neo", "South Park Commons", "Not decided"]),
      one("How far along is the product?", ["Only a deck", "A demo that can be shown", "Beta users", "Already making money"]),
      num("How much do you want to raise this round?", "thousand dollars", ["500", "1500", "3000"]),
    ],
    pace: raise("a seed investor seeing the demo and asking to talk again next week is one step."),
  },
  world_z0ms8yfizp0i: {
    clarify: [
      many("Which accelerators do you plan to apply to?", ["YC", "a16z speedrun", "Neo", "South Park Commons", "Not decided"]),
      one("How many people are on the team?", ["Just me", "Two co-founders", "Three to five"]),
      num("How long will the money you have last?", "months", ["3", "6", "12"]),
    ],
    pace: raise("a seed investor seeing the demo and asking to talk again next week is one step."),
  },
  world_15zavs2h1dyw: {
    clarify: [
      one("Who uses the product now?", ["Individuals", "Small teams", "No users yet"]),
      one("How many people are on the team?", ["Just me", "Two co-founders", "Three to five"]),
      num("How much do you want to raise this round?", "thousand dollars", ["500", "1500", "3000"]),
    ],
    pace: raise("a seed investor seeing the demo and asking to talk again next week is one step."),
  },
  world_5gjazaibzow3: {
    clarify: [
      one("From which moment?", ["After the 2014 Fortune cover", "The night before the Wall Street Journal story, October 2015", "The day after the story ran"]),
      one("How do you want to answer the investigation?", ["Deny everything and push back with lawyers", "Admit part of it and fix things inside", "Work with the regulators", "Not sure yet"]),
      many("What do you most want to keep?", ["The company's valuation", "The Walgreens partnership", "The board's support", "Your own reputation", "Not being prosecuted"]),
    ],
    pace: [
      p("Every exchange", "Each board meeting, each call with the lawyers, each question from a reporter is a step: the reporter Carreyrou sending the company his list of questions is one step.", 110, 115),
      p("Every turn", "A step is when the situation changes direction: the story running, Walgreens pausing the partnership, regulators coming to inspect.", 28, 26),
      p("Every quarter", "A step is a quarter gone by: how the company and your position change each quarter.", 9, 8),
      p("Only the ending", "Only what changes everything is a step: whether the company lives or falls in the end.", 3, 3),
    ],
  },
};

/**
 * What a record played back asks: what it was asked, where it was (as many as there were, up to six), or else what is
 * written for it here; and last its pace, written for it here, where there is one (otherwise asks.tsx puts a sample).
 */
export function designAsked(worldId: string, recorded: Asked[] | null | undefined): Asked[] {
  const s = DESIGN_ASKS[worldId];
  const asked = recorded?.length ? recorded.slice(0, 6) : (s?.clarify ?? []);
  return s ? [...asked, paceAsked({ q: Q, options: s.pace })] : asked;
}
