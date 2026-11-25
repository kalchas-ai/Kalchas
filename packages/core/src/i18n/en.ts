/**
 * The sentences the program writes into a world itself (not a model), in English. Every key is here, and every other
 * language falls back to this one key by key (language.ts, tx). `{name}` is filled in where the sentence is used; a
 * key ending in `_one` / `_other` is a plural form of the key before it, chosen by `{count}` (a language with one form
 * has only `_other`). Plain, calm and short: these are read by people in the product.
 */
export const en = {
  // ---- shared words
  /** The protagonist's name when they play themself, and how "you" is filed on a page. */
  you: "You",
  /** What is left over: a lane of what is known, the catch-all bucket of a table. */
  other: "Other",
  "join.labeled": "{label}: {text}",
  "join.titleDetail": "{title}. {detail}",
  /** Between items of a list written on one line. */
  "sep.list": "; ",

  // ---- the page of what is known, and the build
  "lane.outside": "Outside",
  "lane.figures": "Figures",
  "lane.road": "The road ahead",
  "lane.lookedUp": "Looked up",
  "research.what": "What was looked up for the world and its play",
  "research.unit": "items",
  "build.stalled": "The process running it has stopped (the server may have restarted)",
  "build.skeleton": "Listing the people and what to look up",
  "build.research": "Researching on the web",
  "build.people": "Writing the people",
  "build.opening": "Setting up the opening",

  // ---- timelines and people
  "branch.main": "Main timeline",
  "branch.changed": "Step {step} changed to: {what}",
  "branch.again": "Step {step}, taken again",
  "branch.matched": "Same conditions · {label}",
  "person.ageAt": "As of {date}: {age} years old.",
  "person.firstKnown": "As first known ({date}): {summary}",

  // ---- a play as it runs
  "play.writingStop": "Writing the stop…",
  "play.lookingUp": "Looking up: {query}",
  "play.readingPage": "Reading a page…",
  "play.rollingSeen": "Rolling: {question}",
  "play.rolling": "Rolling…",
  "play.stopNotWritten": "The stop was not written; please try again",
  "play.stopNoScene": "The stop came without its scene; please try again",
  "play.writingOpening": "Writing the opening…",
  "play.openingRounds": "The opening looked things up for {rounds} rounds without writing, and was made to write from what it had",
  "play.settingOpening": "Setting down the opening…",
  "play.noneChosen": "(You did not choose yourself: taken the way you would most naturally take it.)",
  "play.chooseOrWrite": "Choose a way, or write what you do",
  "play.folding": "Keeping the story so far…",
  "play.foldFailed": "The story so far could not be kept: {error}",
  "play.readingMove": "Reading your move…",
  "play.stopRounds": "The stop looked things up for {rounds} rounds without writing, and was made to write from what it had",
  "play.settingStop": "Setting down the stop…",
  "play.outsideReach": "Outside your reach",
  "play.writingReview": "The play is over. Writing the review…",
  "play.endedByYou": "You chose to end here",
  "play.over": "The play is over",
  "play.madeEarlier": "This play was made by an earlier engine: it can be read, not played on.",

  // ---- the setup, and what is written of the protagonist
  "setup.futureStart": "A start in the future: its surroundings are projected",
  "setup.aboutYou": "About yourself: ",
  "setup.aboutSetup": "About the setup of this play: ",
  "persona.putRight": "{text} (put right by them)",

  // ---- the chat box under a play
  "advise.correction": "{text} (a correction of the opening, not a change I made)",
  "advise.stops_one": "{count} stop",
  "advise.stops_other": "{count} stops",
  "advise.empty": "Nothing to pass on",
  "advise.noted": "Noted: it goes into the story from the next step; no time has passed",
  "advise.suggestions_one": "{count} suggestion",
  "advise.suggestions_other": "{count} suggestions",
  "chat.search": "Searching the web for “{query}”",
  "chat.read": "Reading {url}",
  "chat.known": "Checking what you know about “{query}”",
  "chat.recent": "Looking back at what happened lately",
  "chat.draw": "Drawing a chart",
  "chat.moves": "Putting together moves you can make",
  "chat.earlier": "Looking back at earlier stops",
  "chat.instruction": "Noting what you want changed",
  "chat.noSearches": "No searches left for this answer",
  "chat.results_one": "{count} result",
  "chat.results_other": "{count} results",
  "chat.noReads": "No page reads left for this answer",
  "chat.pageRead": "Read",
  "chat.pageUnread": "Could not be read",
  "chat.failed": "Did not work",
  "chat.noAnswer": "No answer was written; please ask again",

  // ---- figures looked up
  "source.estimate": "estimate, unverified",
  "cite.year": "{source}, {year}",
  "cite.estimated": "{cite} (estimate, unverified)",

  // ---- what the page says of how a step went (one sentence per kind of notice)
  "notice.answer": "Part of an answer could not be kept in the world; a note of it was kept.",
  "notice.lookup": "A lookup found no usable figure; the odds are still an estimate.",
  "notice.persona": "A character's profile has not been written yet; for now they are played from their role on the list.",
  "notice.memory": "A character's memory has not been condensed yet; it will be tried again after the next step.",
  "notice.premise": "A premise you set is protected; a change the model proposed to it did not take effect.",
  "notice.review": "The review has not been written yet; it can be written again.",
  "notice.runaway": "This step ran on for an unusual number of rounds without stopping, and was stopped where it was headed; this is a fault to look into.",
  "notice.rounds": "This stop went back and forth an unusual number of times looking things up and rolling, and was made to write from what it had; this is a fault to look into.",
  "notice.fold": "The story so far has not been put together yet; it will be at the next step.",

  // ---- the moment a project stands at
  "moment.today": "Today",
};

export type Key = keyof typeof en;
type PluralOne = Extract<Key, `${string}_one`>;
/** One language's sentences: every key, except the `_one` forms a language without them leaves out. */
export type Messages = Record<Exclude<Key, PluralOne>, string> & Partial<Record<PluralOne, string>>;
