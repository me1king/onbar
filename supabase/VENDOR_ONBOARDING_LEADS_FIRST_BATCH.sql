-- Import the first user-supplied Google Maps prospect batch.
-- Run after VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql and
-- VENDOR_ONBOARDING_CONTACT_MIGRATION.sql. This creates internal leads only;
-- it does not send SMS, WhatsApp, or email.

DO $$
DECLARE
  lead_row JSONB;
  batch JSONB := $leads$
  [
    {"business_name":"Primas Liquors","owner_name":null,"phone":"+254701151511","whatsapp":null,"area":"Donholm (Old Donholm shopping centre), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 4.9 stars (13). Also listed as wholesaler. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Buzz A Booze Liquor Store","owner_name":null,"phone":"+254722427725","whatsapp":null,"area":"Roysambu (TRM Drive), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 4.8 stars (20). Does deliveries. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Sips & Shots Liquor Store","owner_name":null,"phone":"+254799879491","whatsapp":null,"area":"Roysambu (Lumumba Drive), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 5.0 stars (9). Does deliveries. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Blustone Liquor Store","owner_name":null,"phone":"+254712643730","whatsapp":null,"area":"Tegla Lorupe Rd, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 10am-11pm daily. 4.1 stars (115). Offers delivery. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Liquor Closet KE","owner_name":null,"phone":"+254792119118","whatsapp":null,"area":"Nairobi CBD (Swaminarayan Rd, Laxcon Plaza)","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. Also listed as wholesaler. Reviews mention online ordering and delivery; check Instagram or WhatsApp for a shop. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Akin Wines and Spirits","owner_name":null,"phone":"+254723551953","whatsapp":null,"area":"Westlands (Commercial Centre), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 11am-10pm, Thu-Sat to midnight, closed Sunday. 4.7 stars (3). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Nathansouza Wines and Spirits","owner_name":null,"phone":"+254724410376","whatsapp":null,"area":"Donholm (Police Line), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 4.1 stars (7). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"CHEBAIBAI Wines","owner_name":null,"phone":"+254702476833","whatsapp":null,"area":"Donholm shopping centre, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. Listed as a bar. 5.0 stars (2). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Roysambu Wines Store","owner_name":null,"phone":null,"whatsapp":null,"area":"Roysambu (Lumumba Drive), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. No phone listed. Reviews mention fast delivery. Find the number by calling nearby shops or visiting."},
    {"business_name":"Urban Vines Liquor Shop","owner_name":null,"phone":"+254700016545","whatsapp":null,"area":"Ongata Rongai, Kajiado","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 5.0 stars (6). Reviews praise fast delivery. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"The Liqour Land","owner_name":null,"phone":"+254715029462","whatsapp":null,"area":"Ongata Rongai (Shoppers Square)","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 4.9 stars (15). Bar and hangout style spot. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Cana Liquors","owner_name":null,"phone":"+254795637642","whatsapp":null,"area":"Ongata Rongai (Magadi Rd)","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 9am-11pm, closed Monday. 5.0 stars (4). Reviews mention quick deliveries. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Midwest Wine and Spirits","owner_name":null,"phone":"+254726387922","whatsapp":null,"area":"Zimmerman, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Listed as a bar. 5.0 stars (1). No hours listed. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Mwalimu Wine Agencies","owner_name":null,"phone":"+254731282523","whatsapp":null,"area":"Githurai / Zimmerman (Kamiti Rd), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 4.1 stars (116). Sells wholesale and retail, per reviews. No hours listed. Biggest in this group. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Sweetwaters Wines and Spirit","owner_name":null,"phone":"+254726042719","whatsapp":null,"area":"Zimmerman / Githurai area, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 10:11am-8:11pm daily. 5.0 stars (4). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Cheers Wines & Spirits","owner_name":null,"phone":null,"whatsapp":null,"area":"Githurai (Kamiti Rd), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. No phone listed. 5.0 stars (1)."},
    {"business_name":"Wallet Wines And Spirits","owner_name":null,"phone":"+254714098455","whatsapp":null,"area":"Githurai (Kamiti Rd, behind Small Villa), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 9am-9:30pm daily. 4.0 stars (21). Sells wholesale prices and delivers, per reviews. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Tamasha Liquor shop Ruaka","owner_name":null,"phone":"+254768120091","whatsapp":null,"area":"Ruaka (Kirunge Drive), Kiambu","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 5.0 stars (2). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Drink Yangu Liquor Store","owner_name":null,"phone":"+254110973836","whatsapp":null,"area":"Ruaka (Jamuka), Kiambu","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Mon-Thu 2pm-midnight, Fri 11am-midnight, Sat-Sun 24h. 4.5 stars (6). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"BaloziWines South B","owner_name":null,"phone":null,"whatsapp":null,"area":"South B (Mkoma Rd), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. No phone listed. 10am-10pm daily. 4.6 stars (30). Same name as the Buruburu shop; may be related."},
    {"business_name":"Balozi Wines Buruburu","owner_name":null,"phone":null,"whatsapp":null,"area":"Buruburu (Business Complex, Mumias South Rd), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. No phone listed. 4.6 stars (10). Reviews mention party drinks and cocktail menu service."},
    {"business_name":"Tiovino Wines & Spirits","owner_name":null,"phone":"+254728221356","whatsapp":null,"area":"Karen / Langata Rd (The Well Mall), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 10am-8:30pm daily. 5.0 stars (10). Delivers, per reviews. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"The Scotch Den Liqour Store","owner_name":null,"phone":null,"whatsapp":null,"area":"Kayole (Spine Rd), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. No phone listed. Open 24h. 4.6 stars (15)."},
    {"business_name":"Whiskey shop Katani Rd","owner_name":null,"phone":"+254710770350","whatsapp":null,"area":"Syokimau (Katani Rd), Machakos","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 4.4 stars (19). No hours listed. Sit-in spot with football screens, per reviews. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Liquor Fest Wines & Spirits","owner_name":null,"phone":"+254703445445","whatsapp":null,"area":"Syokimau (Katani Rd), Machakos","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 10am-midnight daily. 4.5 stars (138). Pub and wine bar style, large seating area. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"LIQUOR MAX PLUS","owner_name":null,"phone":"+254114612727","whatsapp":null,"area":"Syokimau (Katani Rd), Machakos","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 4.4 stars (7). No hours listed. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Wines n Scotch","owner_name":null,"phone":"+254726031292","whatsapp":null,"area":"Mlolongo (Sabaki), Machakos","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 5.0 stars (1). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Liquor library","owner_name":null,"phone":"+254757003995","whatsapp":null,"area":"Kiambu Road, Kiambu","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 4.6 stars (70). Also listed as wholesaler. Hosts tastings, per reviews. Premium range. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"A1 Liquor Mart","owner_name":null,"phone":"+254702247775","whatsapp":null,"area":"Kiambu Road, Kiambu","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. Listed as wholesaler. 3.0 stars (2); one review complains about price changes. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Silver city liquor store","owner_name":null,"phone":"+254721917273","whatsapp":null,"area":"Limuru Town, Kiambu","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 9am-5pm Mon-Fri, closed weekends. 4.3 stars (3). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"The Fratelli Liquor Store","owner_name":null,"phone":"+254769729596","whatsapp":null,"area":"Kilimani / Kileleshwa area, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 5.0 stars (48). Supplies events and launches, per reviews. Alcohol delivery. Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Jodwin Wines and Spirits","owner_name":null,"phone":"+254725425003","whatsapp":null,"area":"Pangani (Fairview Rd), Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Open 24h. 5.0 stars (1). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Chini Ya Mnazi Liquor Store","owner_name":null,"phone":"+254796445476","whatsapp":null,"area":"Pangani, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. Long hours, 24h on Saturday. 5.0 stars (1). Phone may be WhatsApp; verify before messaging."},
    {"business_name":"Hidden Tavern - Pangani","owner_name":null,"phone":"+254701801796","whatsapp":null,"area":"Pangani, Nairobi","vendor_type":"retailer","agent":"Unassigned","source":"Google Maps listing","notes":"No website on Google profile. 10am-midnight daily. 3.8 stars (41). Sit-in spot. Phone may be WhatsApp; verify before messaging."}
  ]
  $leads$::jsonb;
  inserted_count INTEGER := 0;
  skipped_count INTEGER := 0;
BEGIN
  IF to_regclass('public.vendor_onboarding_leads') IS NULL
    OR to_regclass('public.vendor_onboarding_events') IS NULL
    OR to_regprocedure('public.create_vendor_onboarding_leads(jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'Vendor onboarding pipeline is not installed.'
      USING HINT = 'Run VENDOR_ONBOARDING_PIPELINE_MIGRATION.sql and VENDOR_ONBOARDING_CONTACT_MIGRATION.sql first.';
  END IF;

  FOR lead_row IN SELECT value FROM jsonb_array_elements(batch) AS item(value)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.vendor_onboarding_leads existing
      WHERE lower(trim(existing.business_name)) = lower(trim(lead_row->>'business_name'))
        AND lower(trim(existing.area)) = lower(trim(lead_row->>'area'))
    ) THEN
      skipped_count := skipped_count + 1;
    ELSE
      PERFORM public.create_vendor_onboarding_leads(
        jsonb_build_array(lead_row),
        'Google Maps prospect import (user supplied)'
      );
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'First batch complete: % lead(s) added, % matching name-and-area lead(s) skipped.',
    inserted_count, skipped_count;
END;
$$;
