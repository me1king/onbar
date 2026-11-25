export type VisitorExperienceId = 'build-night' | 'game-night' | 'snacks' | 'souvenirs' | 'home';
export type VisitorExperienceSignals = {
  source: 'direct' | 'game-night' | 'snacks' | 'gifts' | 'whisky';
  time: 'morning' | 'afternoon' | 'evening' | 'late';
  day: 'weekday' | 'weekend' | 'sunday';
  returning: boolean;
};

const experienceOrder: VisitorExperienceId[] = ['build-night', 'game-night', 'snacks', 'souvenirs'];

export function chooseVisitorExperience(signals: VisitorExperienceSignals) {
  const scores: Record<VisitorExperienceId, number> = {
    'build-night': 0,
    'game-night': 0,
    snacks: 0,
    souvenirs: 0,
    home: 0
  };
  const reasons: string[] = [];
  const add = (experience: VisitorExperienceId, points: number, reason: string) => {
    scores[experience] += points;
    reasons.push(reason);
  };

  if (signals.source === 'game-night') add('game-night', 5, 'You came from a Game Night link.');
  if (signals.source === 'snacks') add('snacks', 5, 'You came from a snacks link.');
  if (signals.source === 'gifts') add('souvenirs', 5, 'You came from a gifts link.');
  if (signals.source === 'whisky') add('build-night', 3, 'You came from a party-planning link.');

  if (signals.time === 'evening' || signals.time === 'late') {
    add('build-night', 2, 'It is a good time to plan an evening in.');
    add('game-night', 2, 'Game Night is a good fit for tonight.');
  } else if (signals.time === 'afternoon') {
    add('snacks', 2, 'Afternoon is a good time to sort snacks.');
  } else if (signals.time === 'morning') {
    add('souvenirs', 1, 'You can get ahead on gift planning.');
    add('snacks', 1, 'You can plan snacks ahead.');
  }

  if (signals.day === 'weekend') {
    add('build-night', 3, 'It is the weekend.');
    add('game-night', 4, 'Game Night is popular on weekends.');
  } else if (signals.day === 'sunday') {
    add('game-night', 1, 'A relaxed Sunday suits a game.');
    add('snacks', 1, 'Snacks go well with a Sunday hangout.');
  } else {
    add('snacks', 1, 'A quick snack stop suits a weekday.');
  }

  if (signals.returning) {
    scores.home += 1;
    reasons.push('Welcome back; the full menu is here too.');
  }

  const highestScore = Math.max(...experienceOrder.map(id => scores[id]));
  const winner = experienceOrder.find(id => scores[id] === highestScore) || 'home';
  if (highestScore < 3) return { id: 'home' as const, score: highestScore, reason: 'No strong preference yet, so here is the full menu.' };
  return { id: winner, score: highestScore, reason: reasons.filter(Boolean).slice(-3).join(' ') };
}
