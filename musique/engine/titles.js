// A name for every piece, drawn from its seed: a port of the game's MusicTitles.cs (keep in sync).
// French and English titles are written separately, each with its own grammar.
import { MusicRng } from './rng.js';
import { MusicStyle } from './styles.js';

export const titleOf = (song, language) => title(song.seed, song.style, language);

export const title = (seed, style, language) => language === 'en' ? english(seed, style) : french(seed, style);

// Templates 1-3 use the style word; the styles with a strong name use them half the time.
function template(rng, style) {
  let t = rng.range(0, 7);
  const signature = style === MusicStyle.Waltz || style === MusicStyle.Classical
    || style === MusicStyle.Relaxing || style === MusicStyle.Contemplative;
  if (rng.nextDouble() < 0.5 && signature) t = rng.range(1, 4);
  return t;
}

// ---------------- French ----------------

const noun = (word, feminine, prep = ' ') => ({ word, feminine, prep, vowel: 'aeiouyéèêâîôh'.includes(word[0]) });
const F = (w, p) => noun(w, true, p);
const M = (w, p) => noun(w, false, p);

const FrThings = [
  F('brume'), F('lanterne'), F('fenêtre'), F('lumière'), F('aube'), F('promenade'), F('tasse'), F('pluie'),
  F('étoile'), F('soirée'), F('dentelle'), F('vague'), F('marée'), F('bougie'), F('veillée'), F('lune'),
  F('écharpe'), F('brise'), F('horloge'), F('plume'), F('lettre'), F('rose'), M('matin'), M('soir'),
  M('crépuscule'), M('nuage'), M('coquelicot'), M('tilleul'), M('carrousel'), M('automne'), M('hiver'), M('été'),
  M('voyage'), M('rêve'), M('souvenir'), M('éventail'), M('oiseau'), M('parapluie'), M('cerf-volant'), M('thé'),
];

const FrPlaces = [
  F('terrasse', 's'), F('rivière', 's'), F('fontaine', 'a'), F('colline', 's'), F('plage', 's'), F('cabane', 'a'),
  F('prairie', 's'), F('tonnelle', 'a'), F('île', 's'), F('allée', 'a'), F('clairière', 'a'), F('péniche', 's'),
  F('roseraie', 'a'), F('gare', 'a'), F('guinguette', 'a'), M('jardin', 'a'), M('verger', 'a'), M('port', 'a'),
  M('café', 'a'), M('salon', 'a'), M('chemin', 's'), M('ruisseau', 's'), M('phare', 'a'), M('grenier', 'a'),
  M('kiosque', 'a'), M('balcon', 's'), M('village', 'a'), M('moulin', 'a'), M('lac', 's'), M('bois', 'a'),
  M('quai', 's'), M('atelier', 'a'), M('pont', 's'), M('marché', 'a'),
];

const FrAdjectives = [
  ['doré', 'dorée'], ['tranquille', 'tranquille'], ['lointain', 'lointaine'], ['léger', 'légère'],
  ['bleu', 'bleue'], ['paisible', 'paisible'], ['secret', 'secrète'], ['endormi', 'endormie'],
  ['ancien', 'ancienne'], ['doux', 'douce'], ['clair', 'claire'], ['tendre', 'tendre'],
  ['oublié', 'oubliée'], ['argenté', 'argentée'], ['fleuri', 'fleurie'], ['rêveur', 'rêveuse'],
  ['silencieux', 'silencieuse'], ['ensoleillé', 'ensoleillée'], ['enchanté', 'enchantée'], ['vert', 'verte'],
  ['bleuté', 'bleutée'], ['parfumé', 'parfumée'], ['lumineux', 'lumineuse'], ['suspendu', 'suspendue'],
  ['heureux', 'heureuse'], ['timide', 'timide'], ['sauvage', 'sauvage'], ['fragile', 'fragile'],
  ['ambré', 'ambrée'], ['mauve', 'mauve'],
];

const FrPlurals = [
  'lanternes', 'lilas', 'coquelicots', 'marées', 'étoiles', 'nuages', 'tilleuls', 'jours heureux',
  'beaux jours', 'vacances', 'quais', 'lucioles', 'mouettes', 'cerisiers', 'volets bleus', 'petits matins',
  'dimanches', 'chemins de traverse', 'jardins suspendus', 'saisons', 'cerfs-volants', 'bateaux de papier',
];

const FrStyleWords = [
  ['Balade', 'Promenade', 'Chanson', 'Ritournelle', 'Mélodie', 'Petite musique', 'Air', 'Refrain', 'Souvenir', 'Sérénade'],
  ['Valse', 'Petite valse', 'Valse lente', 'Valse'],
  ['Menuet', 'Sonatine', 'Prélude', 'Air', 'Aria', 'Divertimento', 'Rondo'],
  ['Berceuse', 'Rêverie', 'Songe', 'Douceur', 'Sieste'],
  ['Ritournelle', 'Chanson', 'Petite musique', 'Promenade', 'Comptine', 'Refrain'],
  ['Nocturne', 'Méditation', 'Rêverie', 'Songe', 'Prélude'],
];

const FrMoments = [
  'Dimanche', 'Samedi soir', 'Un matin', "Fin d'après-midi", 'Petit matin', 'Un soir', 'Après la pluie',
  'Mardi', "L'heure bleue", 'Ce soir', 'Premier jour', 'Un dimanche', 'Retour', 'Rendez-vous', 'Pique-nique',
];

const the = (n) => n.vowel ? "l'" + n.word : (n.feminine ? 'la ' : 'le ') + n.word;
const of = (n) => n.vowel ? "de l'" + n.word : (n.feminine ? 'de la ' : 'du ') + n.word;
const at = (n) => n.vowel ? "à l'" + n.word : (n.feminine ? 'à la ' : 'au ') + n.word;
const near = (n) => n.vowel ? "près de l'" + n.word : (n.feminine ? 'près de la ' : 'près du ') + n.word;
const where = (place, rng) => rng.nextDouble() < 0.25 ? near(place) : place.prep === 's' ? 'sur ' + the(place) : at(place);
const adjOf = (n, a) => n.feminine ? a[1] : a[0];

function french(seed, style) {
  const rng = new MusicRng(seed * 31 + 9);
  const words = FrStyleWords[style];
  const thing = rng.pick(FrThings);
  const place = rng.pick(FrPlaces);
  let other = rng.pick(FrThings);
  while (other.word === thing.word) other = rng.pick(FrThings);
  const adj = rng.pick(FrAdjectives);
  const any = rng.nextDouble() < 0.5 ? thing : place;
  let t;
  switch (template(rng, style)) {
    case 0: t = the(any) + ' ' + adjOf(any, adj); break;
    case 1: t = rng.pick(words) + ' ' + of(any); break;
    case 2: t = rng.pick(words) + ' ' + of(any) + ' ' + adjOf(any, adj); break;
    case 3: t = rng.pick(words) + ' des ' + rng.pick(FrPlurals); break;
    case 4: t = rng.pick(FrMoments) + ' ' + where(place, rng); break;
    case 5: t = the(thing) + ' et ' + the(other); break;
    default: t = thing.word + ' ' + adjOf(thing, adj) + ' ' + where(place, rng); break;
  }
  return t[0].toUpperCase() + t.substring(1);
}

// ---------------- English ----------------

const EnThings = [
  'Mist', 'Lantern', 'Window', 'Light', 'Dawn', 'Stroll', 'Teacup', 'Rain', 'Star', 'Evening', 'Lace', 'Wave',
  'Tide', 'Candle', 'Moon', 'Scarf', 'Breeze', 'Clock', 'Feather', 'Letter', 'Rose', 'Morning', 'Dusk', 'Cloud',
  'Poppy', 'Carousel', 'Autumn', 'Winter', 'Summer', 'Journey', 'Dream', 'Keepsake', 'Bird', 'Umbrella', 'Kite', 'Tea',
];

const EnPlaces = [
  ['Terrace', 'on the'], ['River', 'by the'], ['Fountain', 'by the'], ['Hill', 'on the'], ['Beach', 'on the'],
  ['Cabin', 'in the'], ['Meadow', 'in the'], ['Arbour', 'under the'], ['Island', 'on the'], ['Lane', 'down the'],
  ['Clearing', 'in the'], ['Garden', 'in the'], ['Orchard', 'in the'], ['Harbour', 'by the'], ['Café', 'at the'],
  ['Parlour', 'in the'], ['Path', 'along the'], ['Brook', 'by the'], ['Lighthouse', 'by the'], ['Attic', 'in the'],
  ['Bandstand', 'at the'], ['Balcony', 'on the'], ['Village', 'in the'], ['Mill', 'by the'], ['Lake', 'by the'],
  ['Woods', 'in the'], ['Quay', 'on the'], ['Workshop', 'in the'], ['Bridge', 'on the'], ['Market', 'at the'],
  ['Station', 'at the'], ['Rose Garden', 'in the'],
];

const EnAdjectives = [
  'Golden', 'Quiet', 'Distant', 'Gentle', 'Blue', 'Peaceful', 'Secret', 'Sleepy', 'Old', 'Soft', 'Clear',
  'Tender', 'Forgotten', 'Silver', 'Blooming', 'Dreamy', 'Silent', 'Sunny', 'Enchanted', 'Green', 'Violet',
  'Fragrant', 'Bright', 'Drifting', 'Happy', 'Shy', 'Wild', 'Fragile', 'Velvet', 'Amber',
];

const EnPlurals = [
  'Lanterns', 'Lilacs', 'Poppies', 'Tides', 'Stars', 'Clouds', 'Linden Trees', 'Happy Days', 'Summer Days',
  'Holidays', 'Fireflies', 'Seagulls', 'Cherry Trees', 'Blue Shutters', 'Early Mornings', 'Sundays',
  'Winding Paths', 'Hanging Gardens', 'Seasons', 'Paper Boats', 'Kites',
];

const EnStyleWords = [
  ['Ballad', 'Stroll', 'Song', 'Air', 'Melody', 'Little Tune', 'Refrain', 'Keepsake', 'Serenade'],
  ['Waltz', 'Little Waltz', 'Slow Waltz', 'Waltz'],
  ['Minuet', 'Sonatina', 'Prelude', 'Air', 'Aria', 'Divertimento', 'Rondo'],
  ['Lullaby', 'Reverie', 'Daydream', 'Siesta', 'Slumber Song'],
  ['Little Tune', 'Song', 'Stroll', 'Nursery Rhyme', 'Refrain', 'Tea-time Tune'],
  ['Nocturne', 'Meditation', 'Reverie', 'Daydream', 'Prelude'],
];

const EnMoments = [
  'Sunday', 'Saturday Night', 'One Morning', 'Late Afternoon', 'Early Morning', 'One Evening', 'After the Rain',
  'Tuesday', 'Blue Hour', 'Tonight', 'First Day', 'A Sunday', 'Homecoming', 'Rendezvous', 'Picnic',
];

function english(seed, style) {
  const rng = new MusicRng(seed * 31 + 10);
  const words = EnStyleWords[style];
  const thing = rng.pick(EnThings);
  let other = rng.pick(EnThings);
  while (other === thing) other = rng.pick(EnThings);
  const place = rng.pick(EnPlaces);
  const adj = rng.pick(EnAdjectives);
  const any = rng.nextDouble() < 0.5 ? thing : place[0];
  const w = (rng.nextDouble() < 0.25 ? 'near the' : place[1]) + ' ' + place[0];
  switch (template(rng, style)) {
    case 0: return 'The ' + adj + ' ' + any;
    case 1: return rng.pick(words) + ' of the ' + any;
    case 2: return rng.pick(words) + ' for the ' + adj + ' ' + any;
    case 3: return rng.pick(words) + ' of ' + rng.pick(EnPlurals);
    case 4: return rng.pick(EnMoments) + ' ' + w;
    case 5: return 'The ' + thing + ' and the ' + other;
    default: return adj + ' ' + thing + ' ' + w;
  }
}
