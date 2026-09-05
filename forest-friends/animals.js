/* Familiar animals seen, kept, or commonly taught to children in India. */
var ANIMALS_DATA = [
  { key:'bear', name:'Bear', emoji:'🐻', telugu:'ఎలుగుబంటి', teluguRoman:'elugubanti', call:'గుర్ర్ · growl', taxon:'Ursus arctos', aliases:['bear','teddy','elugubanti','elugu'], sound:'growl' },
  { key:'bee', name:'Bee', emoji:'🐝', telugu:'తేనెటీగ', teluguRoman:'thenetega', call:'బజ్ · buzz', taxon:'Apis cerana', aliases:['bee','thenetega','honeybee'], sound:'buzz' },
  { key:'buffalo', name:'Buffalo', emoji:'🐃', telugu:'గేదె', teluguRoman:'gede', call:'అంబా · ambaa', taxon:'Bubalus bubalis', aliases:['buffalo','gede','water buffalo'], sound:'moo' },
  { key:'cat', name:'Cat', emoji:'🐈', telugu:'పిల్లి', teluguRoman:'pilli', call:'మ్యావ్ · myaav', taxon:'Felis catus', aliases:['cat','pilli','kitty','kitten'], sound:'meow' },
  { key:'chicken', name:'Chicken', emoji:'🐔', telugu:'కోడి', teluguRoman:'kodi', call:'కొక్ కొక్ · cluck', taxon:'Gallus gallus domesticus', aliases:['chicken','kodi'], sound:'cluck' },
  { key:'cow', name:'Cow', emoji:'🐄', telugu:'ఆవు', teluguRoman:'aavu', call:'అంబా · ambaa', taxon:'Bos taurus', aliases:['cow','aavu','avu'], sound:'moo' },
  { key:'crow', name:'Crow', emoji:'🐦‍⬛', telugu:'కాకి', teluguRoman:'kaaki', call:'కా కా · kaa kaa', taxon:'Corvus splendens', aliases:['crow','kaaki','kaki'], sound:'chirp' },
  { key:'deer', name:'Deer', emoji:'🦌', telugu:'జింక', teluguRoman:'jinka', call:'bark', taxon:'Axis axis', aliases:['deer','jinka','spotted deer','chital'], sound:'bark' },
  { key:'dog', name:'Dog', emoji:'🐕', telugu:'కుక్క', teluguRoman:'kukka', call:'భౌ భౌ · bhau bhau', taxon:'Canis lupus familiaris', aliases:['dog','kukka','puppy','doggy'], sound:'bark' },
  { key:'donkey', name:'Donkey', emoji:'🫏', telugu:'గాడిద', teluguRoman:'gaadida', call:'hee-haw', taxon:'Equus africanus asinus', aliases:['donkey','gaadida','gadida'], sound:'neigh' },
  { key:'duck', name:'Duck', emoji:'🦆', telugu:'బాతు', teluguRoman:'baatu', call:'క్వాక్ · quack', taxon:'Anas platyrhynchos', aliases:['duck','baatu','batu'], sound:'quack' },
  { key:'eagle', name:'Eagle', emoji:'🦅', telugu:'గద్ద', teluguRoman:'gadda', call:'screech', taxon:'Aquila nipalensis', aliases:['eagle','gadda','garuda','steppe eagle'], sound:'screech' },
  { key:'elephant', name:'Elephant', emoji:'🐘', telugu:'ఏనుగు', teluguRoman:'enugu', call:'trumpet', taxon:'Elephas maximus', aliases:['elephant','enugu','elefant'], sound:'trumpet' },
  { key:'fox', name:'Fox', emoji:'🦊', telugu:'నక్క', teluguRoman:'nakka', call:'yelp', taxon:'Vulpes vulpes', aliases:['fox','nakka','red fox'], sound:'howl' },
  { key:'frog', name:'Frog', emoji:'🐸', telugu:'కప్ప', teluguRoman:'kappa', call:'బెక బెక · croak', taxon:'Hoplobatrachus tigerinus', aliases:['frog','kappa','indian bullfrog'], sound:'ribbit' },
  { key:'goat', name:'Goat', emoji:'🐐', telugu:'మేక', teluguRoman:'meka', call:'మే మే · mae mae', taxon:'Capra hircus', aliases:['goat','meka'], sound:'baa' },
  { key:'hen', name:'Hen', emoji:'🐔', telugu:'ఆడకోడి', teluguRoman:'aadakodi', call:'కొక్ కొక్ · cluck', taxon:'Gallus gallus domesticus', aliases:['hen','aadakodi'], sound:'cluck' },
  { key:'horse', name:'Horse', emoji:'🐎', telugu:'గుర్రం', teluguRoman:'gurram', call:'neigh', taxon:'Equus caballus', aliases:['horse','gurram'], sound:'neigh' },
  { key:'leopard', name:'Leopard', emoji:'🐆', telugu:'చిరుత', teluguRoman:'chiruta', call:'growl', taxon:'Panthera pardus', aliases:['leopard','chiruta'], sound:'growl' },
  { key:'lion', name:'Lion', emoji:'🦁', telugu:'సింహం', teluguRoman:'simham', call:'roar', taxon:'Panthera leo', aliases:['lion','simham','asiatic lion'], sound:'roar' },
  { key:'monkey', name:'Monkey', emoji:'🐒', telugu:'కోతి', teluguRoman:'koti', call:'chatter', taxon:'Macaca', aliases:['monkey','koti','macaque'], sound:'screech' },
  { key:'mouse', name:'Mouse', emoji:'🐁', telugu:'ఎలుక', teluguRoman:'eluka', call:'squeak', taxon:'Mus musculus', aliases:['mouse','eluka'], sound:'squeak' },
  { key:'myna', name:'Myna', emoji:'🐦', telugu:'గోరింక', teluguRoman:'gorinka', call:'whistle', taxon:'Acridotheres tristis', aliases:['myna','mynah','gorinka'], sound:'tweet' },
  { key:'owl', name:'Owl', emoji:'🦉', telugu:'గుడ్లగూబ', teluguRoman:'gudlagooba', call:'హూ హూ · hoo hoo', taxon:'Athene brama', aliases:['owl','gudlagooba','spotted owlet'], sound:'hoot' },
  { key:'parrot', name:'Parrot', emoji:'🦜', telugu:'చిలుక', teluguRoman:'chiluka', call:'squawk', taxon:'Psittacula krameri', aliases:['parrot','chiluka','parakeet'], sound:'chirp' },
  { key:'peacock', name:'Peacock', emoji:'🦚', telugu:'నెమలి', teluguRoman:'nemali', call:'మియావ్ · may-awe', taxon:'Pavo cristatus', aliases:['peacock','nemali','indian peafowl'], sound:'screech' },
  { key:'pig', name:'Pig', emoji:'🐖', telugu:'పంది', teluguRoman:'pandi', call:'ఒయింక్ · oink', taxon:'Sus scrofa domesticus', aliases:['pig','pandi','piggy'], sound:'oink' },
  { key:'pigeon', name:'Pigeon', emoji:'🕊️', telugu:'పావురం', teluguRoman:'paavuram', call:'గుటుర్ గూ · gutur goo', taxon:'Columba livia', aliases:['pigeon','paavuram','pavuram','dove'], sound:'hoot' },
  { key:'rabbit', name:'Rabbit', emoji:'🐇', telugu:'కుందేలు', teluguRoman:'kundelu', call:'soft squeak', taxon:'Oryctolagus cuniculus', aliases:['rabbit','kundelu','bunny'], sound:'squeak' },
  { key:'rooster', name:'Rooster', emoji:'🐓', telugu:'కోడిపుంజు', teluguRoman:'kodipunju', call:'కొక్కొరోకో · cock-a-doodle-doo', taxon:'Gallus gallus domesticus', aliases:['rooster','kodipunju','cockerel'], sound:'cluck' },
  { key:'sheep', name:'Sheep', emoji:'🐑', telugu:'గొర్రె', teluguRoman:'gorre', call:'బా బా · baa baa', taxon:'Ovis aries', aliases:['sheep','gorre'], sound:'baa' },
  { key:'snake', name:'Snake', emoji:'🐍', telugu:'పాము', teluguRoman:'paamu', call:'బుస్స్ · hiss', taxon:'Serpentes', aliases:['snake','paamu','cobra'], sound:'hiss' },
  { key:'sparrow', name:'Sparrow', emoji:'🐦', telugu:'పిచ్చుక', teluguRoman:'pichuka', call:'చివ్ చివ్ · chirp', taxon:'Passer domesticus', aliases:['sparrow','pichuka','house sparrow'], sound:'chirp' },
  { key:'squirrel', name:'Squirrel', emoji:'🐿️', telugu:'ఉడుత', teluguRoman:'uduta', call:'chirp', taxon:'Funambulus palmarum', aliases:['squirrel','uduta','palm squirrel'], sound:'chirp' },
  { key:'tiger', name:'Tiger', emoji:'🐅', telugu:'పులి', teluguRoman:'puli', call:'roar', taxon:'Panthera tigris', aliases:['tiger','puli','bengal tiger'], sound:'roar' },
  { key:'wolf', name:'Wolf', emoji:'🐺', telugu:'తోడేలు', teluguRoman:'todelu', call:'howl', taxon:'Canis lupus', aliases:['wolf','todelu','indian wolf'], sound:'howl' }
];

if (typeof window !== 'undefined') {
  window.ANIMALS = ANIMALS_DATA;
  window.animalsByLetter = function (letter) {
    return window.ANIMALS.filter(function (a) {
      return a.name.replace(/[^a-z]/i, '').charAt(0).toUpperCase() === String(letter).toUpperCase();
    });
  };
}
