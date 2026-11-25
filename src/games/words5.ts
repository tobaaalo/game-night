/** Everyday five-letter words, so Word Guess never asks for a name or something obscure. */
export const WORDS5 =
  "about above actor adult after again agree ahead alarm album alive allow alone along angry apple arena argue arise army arrow aside asset avoid awake award aware bacon badge baker basic beach beard beast begin being below bench berry bible birth black blade blame blank blind block blood board boast bonus boost brain brand brave bread break brick bride brief bring broad brown brush build bunch burst cabin cable camel candy carry catch cause chain chair chalk charm chase cheap check cheek cheer chess chest chief child chill choir civil claim class clean clear clerk click cliff climb clock close cloth cloud clown coach coast color couch cough could count court cover crack craft crane crash crawl crazy cream crime cross crowd crown crush curve cycle daily dance death delay dense depth dirty doubt dozen draft drain drama dream dress drift drink drive eager eagle early earth eight elbow empty enemy enjoy enter equal error event every exact extra faith false fault feast fence fever field fifth fight final first flame flash fleet float flock flood floor flour fluid focus force forge forth forty found frame fraud fresh front frost fruit funny ghost giant glass globe glory glove grace grade grain grand grant grape graph grass grave great green greet grill group guard guess guest guide habit happy harsh heart heavy hello honey honor horse hotel house human humor ideal image inbox index inner input issue ivory jelly jewel joint judge juice keyed knife knock label large laser later laugh layer learn lease least leave legal lemon level light limit linen liver local logic loose lover lower lucky lunch magic major maker march match maybe mayor meant medal media melon mercy metal meter might minor minus mixed model money month moral motor mount mouse mouth movie music naked nasty nerve never newly night noble noise north novel nurse ocean offer often olive onion opera orbit order organ other ought outer owner paint panel paper party pasta patch pause peace pearl phone photo piano piece pilot pitch pizza place plain plane plant plate plaza point polar pound power press price pride prime print prize proof proud prove pupil queen quick quiet quite radio raise rally ranch range rapid ratio reach react ready realm rebel refer relax reply rider ridge right rival river roast robot rocky rough round route royal rural salad sauce scale scene scope score sense serve seven shade shake shape share sharp sheep sheet shelf shell shift shine shirt shock shoot shore short shout sight silly since sixth skill skirt sleep slice slide small smart smell smile smoke snake solar solid solve sorry sound south space spare speak speed spell spend spice spike split spoon sport staff stage stair stamp stand start state steak steam steel steep stick still stock stone store storm story stove strap straw strip study stuff style sugar suite sunny super sweet swept swift swing sword table taste teach thank theme thick thing think third three throw thumb tiger tight tired title toast today tooth topic total touch tough towel tower toxic trace track trade trail train treat trend trial tribe trick truck truly trust truth twice uncle under union unite until upper upset urban usage usual valid value video virus visit vital vocal voice waste watch water wheat wheel where which while white whole whose woman world worry worth would wound write wrong yacht young youth zebra";
export const ANSWERS5 = WORDS5.split(" ").filter((w) => w.length === 5 && w !== "keyed");

/** Places for Find the Spy. */
export const PLACES = [
  "Airport",
  "Bakery",
  "Bank",
  "Beach",
  "Birthday party",
  "Bus station",
  "Cinema",
  "Church",
  "Circus",
  "Classroom",
  "Farm",
  "Fire station",
  "Football match",
  "Gym",
  "Hospital",
  "Hotel",
  "Library",
  "Market",
  "Museum",
  "Park",
  "Police station",
  "Restaurant",
  "School bus",
  "Ship",
  "Supermarket",
  "Wedding",
  "Zoo",
  "Barber shop",
  "Petrol station",
  "Swimming pool",
];
