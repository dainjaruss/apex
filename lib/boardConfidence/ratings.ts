// lib/boardConfidence/ratings.ts
//
// Static catalog of current US Navy enlisted general ratings (curated, current
// as of 2026). Drives the Record Entry rating dropdown so it works even when
// no LaDR documents are stored yet (v1.4 — the dropdown previously listed only
// DB-stored ratings and rendered empty on an unseeded database), and validates
// the on-demand LaDR fetch route's rating parameter.

export interface NavyRating {
  abbrev: string;
  name: string;
}

export const NAVY_RATINGS: NavyRating[] = [
  { abbrev: "ABE", name: "Aviation Boatswain's Mate (Launch/Recovery)" },
  { abbrev: "ABF", name: "Aviation Boatswain's Mate (Fuels)" },
  { abbrev: "ABH", name: "Aviation Boatswain's Mate (Aircraft Handling)" },
  { abbrev: "AC", name: "Air Traffic Controller" },
  { abbrev: "AD", name: "Aviation Machinist's Mate" },
  { abbrev: "AE", name: "Aviation Electrician's Mate" },
  { abbrev: "AG", name: "Aerographer's Mate" },
  { abbrev: "AM", name: "Aviation Structural Mechanic" },
  { abbrev: "AME", name: "Aviation Structural Mechanic (Safety Equipment)" },
  { abbrev: "AO", name: "Aviation Ordnanceman" },
  { abbrev: "AS", name: "Aviation Support Equipment Technician" },
  { abbrev: "AT", name: "Aviation Electronics Technician" },
  { abbrev: "AWF", name: "Naval Aircrewman (Mechanical)" },
  { abbrev: "AWO", name: "Naval Aircrewman (Operator)" },
  { abbrev: "AWR", name: "Naval Aircrewman (Tactical Helicopter)" },
  { abbrev: "AWS", name: "Naval Aircrewman (Helicopter)" },
  { abbrev: "AWV", name: "Naval Aircrewman (Avionics)" },
  { abbrev: "AZ", name: "Aviation Maintenance Administrationman" },
  { abbrev: "BM", name: "Boatswain's Mate" },
  { abbrev: "BU", name: "Builder" },
  { abbrev: "CE", name: "Construction Electrician" },
  { abbrev: "CM", name: "Construction Mechanic" },
  { abbrev: "CS", name: "Culinary Specialist" },
  { abbrev: "CSS", name: "Culinary Specialist (Submarines)" },
  { abbrev: "CTI", name: "Cryptologic Technician (Interpretive)" },
  { abbrev: "CTM", name: "Cryptologic Technician (Maintenance)" },
  { abbrev: "CTR", name: "Cryptologic Technician (Collection)" },
  { abbrev: "CTT", name: "Cryptologic Technician (Technical)" },
  { abbrev: "CWT", name: "Cyber Warfare Technician" },
  { abbrev: "DC", name: "Damage Controlman" },
  { abbrev: "EA", name: "Engineering Aide" },
  { abbrev: "EM", name: "Electrician's Mate" },
  { abbrev: "EMN", name: "Electrician's Mate (Nuclear)" },
  { abbrev: "EN", name: "Engineman" },
  { abbrev: "EO", name: "Equipment Operator" },
  { abbrev: "EOD", name: "Explosive Ordnance Disposal Technician" },
  { abbrev: "ET", name: "Electronics Technician" },
  { abbrev: "ETN", name: "Electronics Technician (Nuclear)" },
  { abbrev: "ETR", name: "Electronics Technician (Submarine, Communications)" },
  { abbrev: "ETV", name: "Electronics Technician (Submarine, Navigation)" },
  { abbrev: "FC", name: "Fire Controlman" },
  { abbrev: "FCA", name: "Fire Controlman (AEGIS)" },
  { abbrev: "FT", name: "Fire Control Technician" },
  { abbrev: "GM", name: "Gunner's Mate" },
  { abbrev: "GSE", name: "Gas Turbine System Technician (Electrical)" },
  { abbrev: "GSM", name: "Gas Turbine System Technician (Mechanical)" },
  { abbrev: "HM", name: "Hospital Corpsman" },
  { abbrev: "HT", name: "Hull Maintenance Technician" },
  { abbrev: "IC", name: "Interior Communications Electrician" },
  { abbrev: "IS", name: "Intelligence Specialist" },
  { abbrev: "IT", name: "Information Systems Technician" },
  { abbrev: "ITS", name: "Information Systems Technician (Submarines)" },
  { abbrev: "LN", name: "Legalman" },
  { abbrev: "LS", name: "Logistics Specialist" },
  { abbrev: "LSS", name: "Logistics Specialist (Submarines)" },
  { abbrev: "MA", name: "Master-at-Arms" },
  { abbrev: "MC", name: "Mass Communication Specialist" },
  { abbrev: "MM", name: "Machinist's Mate" },
  { abbrev: "MMA", name: "Machinist's Mate (Auxiliary)" },
  { abbrev: "MMN", name: "Machinist's Mate (Nuclear)" },
  { abbrev: "MMW", name: "Machinist's Mate (Weapons)" },
  { abbrev: "MN", name: "Mineman" },
  { abbrev: "MR", name: "Machinery Repairman" },
  { abbrev: "MT", name: "Missile Technician" },
  { abbrev: "MU", name: "Musician" },
  { abbrev: "ND", name: "Navy Diver" },
  { abbrev: "OS", name: "Operations Specialist" },
  { abbrev: "PR", name: "Aircrew Survival Equipmentman" },
  { abbrev: "PS", name: "Personnel Specialist" },
  { abbrev: "QM", name: "Quartermaster" },
  { abbrev: "RP", name: "Religious Program Specialist" },
  { abbrev: "RS", name: "Retail Services Specialist" },
  { abbrev: "RW", name: "Robotics Warfare Specialist" },
  { abbrev: "SB", name: "Special Warfare Boat Operator" },
  { abbrev: "SO", name: "Special Warfare Operator" },
  { abbrev: "STG", name: "Sonar Technician (Surface)" },
  { abbrev: "STS", name: "Sonar Technician (Submarine)" },
  { abbrev: "SW", name: "Steelworker" },
  { abbrev: "TM", name: "Torpedoman's Mate" },
  { abbrev: "UT", name: "Utilitiesman" },
  { abbrev: "YN", name: "Yeoman" },
  { abbrev: "YNS", name: "Yeoman (Submarines)" },
];

const BY_ABBREV = new Map(NAVY_RATINGS.map((r) => [r.abbrev, r.name]));

export function ratingName(abbrev: string): string | null {
  return BY_ABBREV.get(abbrev.toUpperCase()) ?? null;
}

export function isKnownRating(abbrev: string): boolean {
  return BY_ABBREV.has(abbrev.toUpperCase());
}
