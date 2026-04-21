// defaultCategoryData.ts
// This is your bundled fallback — mirrors your current AllInOneCategoryData
// When Firestore has no data yet, this is used as the initial value.

export const DEFAULT_CATEGORY_DATA = {
    buyerCategories: [
      {
        key: "Women",
        image: "women.jpg",
        subcategories: [
          {
            key: "Fashion",
            subSubcategories: [
              "Dresses", "Tops & Shirts", "Bottoms", "Outerwear",
              "Underwear & Sleepwear", "Swimwear", "Activewear",
              "Suits & Formal", "Traditional & Cultural",
            ],
          },
          {
            key: "Shoes",
            subSubcategories: [
              "Sneakers & Athletic", "Casual Shoes", "Formal Shoes",
              "Boots", "Sandals & Flip-Flops", "Slippers", "Specialized Footwear",
            ],
          },
          {
            key: "Accessories",
            subSubcategories: [
              "Jewelry", "Watches", "Belts", "Hats & Caps", "Scarves & Wraps",
              "Sunglasses & Eyewear", "Gloves", "Hair Accessories", "Other Accessories",
            ],
          },
          {
            key: "Bags",
            subSubcategories: [
              "Handbags", "Backpacks", "Travel Luggage",
              "Sports & Gym Bags", "Wallets & Small Accessories", "Specialty Bags",
            ],
          },
          {
            key: "Self Care",
            subSubcategories: [
              "Skincare", "Makeup", "Haircare", "Fragrances", "Personal Hygiene",
              "Nail Care", "Body Care", "Oral Care", "Beauty Tools & Accessories",
            ],
          },
        ],
      },
      {
        key: "Men",
        image: "men.jpg",
        subcategories: [
          {
            key: "Fashion",
            subSubcategories: [
              "Tops & Shirts", "Bottoms", "Outerwear", "Underwear & Sleepwear",
              "Swimwear", "Activewear", "Suits & Formal", "Traditional & Cultural",
            ],
          },
          {
            key: "Shoes",
            subSubcategories: [
              "Sneakers & Athletic", "Casual Shoes", "Formal Shoes",
              "Boots", "Sandals & Flip-Flops", "Slippers", "Specialized Footwear",
            ],
          },
          {
            key: "Accessories",
            subSubcategories: [
              "Watches", "Belts", "Hats & Caps",
              "Sunglasses & Eyewear", "Gloves", "Other Accessories",
            ],
          },
          {
            key: "Bags",
            subSubcategories: [
              "Backpacks", "Travel Luggage", "Briefcases & Business Bags",
              "Sports & Gym Bags", "Wallets & Small Accessories", "Specialty Bags",
            ],
          },
          {
            key: "Self Care",
            subSubcategories: [
              "Personal Hygiene", "Haircare", "Fragrances",
              "Body Care", "Oral Care", "Beauty Tools & Accessories",
            ],
          },
        ],
      },
      {
        key: "Mother & Child",
        image: "mother_child.jpg",
        subcategories: [
          {
            key: "Baby Clothing",
            subSubcategories: ["Bodysuits", "Rompers", "Baby Sets", "Baby Sleepwear", "Baby Socks", "Baby Hats", "Baby Mittens"],
          },
          {
            key: "Kids Clothing",
            subSubcategories: ["Kids T-Shirts", "Kids Pants", "Kids Dresses", "Kids Sweatshirts", "Kids Jackets", "Kids Pajamas", "School Uniforms"],
          },
          {
            key: "Kids Footwear",
            subSubcategories: ["Kids Sneakers", "Kids Sandals", "Kids Boots", "School Shoes", "Sports Shoes", "Rain Boots", "Kids Slippers"],
          },
          {
            key: "Toys & Games",
            subSubcategories: ["Educational Toys", "Plush Toys", "Building Blocks", "Dolls & Action Figures", "Puzzles", "Board Games", "Electronic Toys", "Outdoor Play"],
          },
          {
            key: "Baby Care",
            subSubcategories: ["Diapers", "Baby Wipes", "Baby Skincare", "Baby Bath Products", "Baby Health", "Baby Monitors"],
          },
          {
            key: "Maternity",
            subSubcategories: ["Maternity Clothing", "Nursing Bras", "Maternity Accessories", "Pregnancy Support"],
          },
          {
            key: "Strollers & Car Seats",
            subSubcategories: ["Strollers", "Car Seats", "Travel Systems", "Booster Seats", "Stroller Accessories"],
          },
          {
            key: "Feeding & Nursing",
            subSubcategories: ["Baby Bottles", "Breast Pumps", "Pacifiers", "High Chairs", "Feeding Accessories", "Baby Food"],
          },
          {
            key: "Safety & Security",
            subSubcategories: ["Baby Gates", "Outlet Covers", "Cabinet Locks", "Corner Guards", "Baby Monitors"],
          },
          {
            key: "Educational",
            subSubcategories: ["Learning Toys", "Educational Books", "Flash Cards", "Science Kits", "Musical Instruments"],
          },
        ],
      },
      {
        key: "Home & Furniture",
        image: "home_furniture.jpg",
        subcategories: [
          { key: "Living Room Furniture", subSubcategories: ["Sofas", "Armchairs", "Coffee Tables", "TV Stands", "Bookcases", "Side Tables", "Ottoman", "Recliners"] },
          { key: "Bedroom Furniture", subSubcategories: ["Beds", "Mattresses", "Wardrobes", "Dressers", "Nightstands", "Mirrors", "Bed Frames", "Headboards"] },
          { key: "Kitchen & Dining", subSubcategories: ["Dining Tables", "Dining Chairs", "Bar Stools", "Kitchen Islands", "Cookware", "Dinnerware", "Glassware", "Kitchen Appliances", "Utensils"] },
          { key: "Bathroom", subSubcategories: ["Bathroom Vanities", "Shower Curtains", "Bath Mats", "Towel Racks", "Bathroom Storage", "Mirrors", "Accessories"] },
          { key: "Home Decor", subSubcategories: ["Wall Art", "Decorative Objects", "Candles", "Vases", "Picture Frames", "Clocks", "Artificial Plants", "Sculptures"] },
          { key: "Lighting", subSubcategories: ["Ceiling Lights", "Table Lamps", "Floor Lamps", "Wall Lights", "Pendant Lights", "Chandelier", "String Lights", "Night Lights"] },
          { key: "Storage & Organization", subSubcategories: ["Shelving Units", "Storage Boxes", "Baskets", "Hangers", "Closet Organizers", "Drawer Organizers", "Storage Bins"] },
          { key: "Textiles & Soft Furnishing", subSubcategories: ["Curtains", "Blinds", "Rugs", "Cushions", "Throws", "Bed Linens", "Towels", "Blankets"] },
          { key: "Garden & Outdoor", subSubcategories: ["Garden Furniture", "Plant Pots", "Garden Tools", "Outdoor Lighting", "BBQ & Grills", "Umbrellas", "Garden Decor"] },
        ],
      },
      {
        key: "Electronics",
        image: "electronics.jpg",
        subcategories: [
          { key: "Smartphones & Accessories", subSubcategories: ["Smartphones", "Phone Cases", "Screen Protectors", "Chargers", "Power Banks", "Phone Stands", "Wireless Chargers"] },
          { key: "Computers & Laptops", subSubcategories: ["Laptops", "Desktop Computers", "Tablets", "Monitors", "Keyboards", "Mice", "Laptop Accessories", "Computer Components"] },
          { key: "TVs & Home Entertainment", subSubcategories: ["Smart TVs", "Projectors", "Streaming Devices", "TV Mounts & Stands", "Home Theater Systems", "TV Cables & Accessories", "Remote Controls", "TV Antennas", "Media Players"] },
          { key: "Audio Equipment", subSubcategories: ["Headphones", "Earbuds", "Speakers", "Sound Systems", "Soundbars", "Microphones", "Amplifiers", "Turntables", "Audio Cables"] },
          { key: "Gaming", subSubcategories: ["Gaming Consoles", "Video Games", "Gaming Controllers", "Gaming Headsets", "Gaming Chairs", "VR Headsets", "Gaming Accessories"] },
          { key: "Smart Home & IoT", subSubcategories: ["Smart Speakers", "Smart Lights", "Smart Plugs", "Security Cameras", "Smart Thermostats", "Smart Locks", "Home Automation"] },
          { key: "Cameras & Photography", subSubcategories: ["Digital Cameras", "DSLR Cameras", "Action Cameras", "Camera Lenses", "Tripods", "Camera Accessories", "Photography Equipment"] },
          { key: "Wearable Tech", subSubcategories: ["Smartwatches", "Fitness Trackers", "Smart Glasses", "Health Monitors", "Wearable Accessories"] },
          { key: "Home Appliances", subSubcategories: ["Kitchen Appliances", "White Goods", "Air Conditioning", "Heating"] },
          { key: "Personal Care Electronics", subSubcategories: ["Hair Dryers", "Hair Straighteners", "Electric Shavers", "Toothbrushes", "Beauty Devices", "Health Monitors"] },
        ],
      },
      {
        key: "Books, Stationery & Hobby",
        image: "books_stationery_hobby.jpg",
        subcategories: [
          { key: "Books & Literature", subSubcategories: ["Fiction Books", "Non-Fiction Books", "Educational Books", "Children's Books", "Reference Books", "Magazines", "Comics", "E-Books"] },
          { key: "Office & School Supplies", subSubcategories: ["Notebooks", "Binders", "Folders", "Desk Accessories", "Calculators", "Labels", "Staplers", "Organizers"] },
          { key: "Art & Craft Supplies", subSubcategories: ["Drawing Supplies", "Painting Supplies", "Craft Materials", "Scrapbooking", "Sewing Supplies", "Jewelry Making", "Model Building"] },
          { key: "Writing Instruments", subSubcategories: ["Pens", "Pencils", "Markers", "Highlighters", "Fountain Pens", "Mechanical Pencils", "Erasers"] },
          { key: "Paper Products", subSubcategories: ["Copy Paper", "Specialty Paper", "Cardstock", "Envelopes", "Sticky Notes", "Index Cards", "Construction Paper"] },
          { key: "Educational Materials", subSubcategories: ["Learning Games", "Flash Cards", "Educational Toys", "Science Kits", "Math Tools", "Language Learning"] },
          { key: "Hobbies & Collections", subSubcategories: ["Board Games", "Puzzles", "Trading Cards", "Collectibles", "Model Kits", "Gaming Accessories"] },
          { key: "Musical Instruments", subSubcategories: ["String Instruments", "Wind Instruments", "Percussion", "Electronic Instruments", "Music Accessories", "Sheet Music"] },
        ],
      },
      {
        key: "Flowers & Gifts",
        image: "flowers_gifts.jpg",
        subcategories: [
          { key: "Bouquets & Arrangements", subSubcategories: ["Bouquets", "Flower Arrangements", "Mixed Arrangements", "Single Flower Types", "Seasonal Arrangements"] },
          { key: "Potted Plants", subSubcategories: ["Indoor Plants", "Outdoor Plants", "Succulents", "Orchids", "Bonsai", "Cacti"] },
          { key: "Gift Arrangements", subSubcategories: ["Chocolate Arrangements", "Edible Arrangements", "Fruit Baskets", "Gift Combos", "Balloon Arrangements"] },
          { key: "Flower Accessories", subSubcategories: ["Vases", "Planters & Pots", "Floral Foam", "Ribbons & Wraps", "Plant Care Products", "Decorative Accessories"] },
          { key: "Wreaths & Centerpieces", subSubcategories: ["Funeral Wreaths", "Decorative Wreaths", "Table Centerpieces", "Event Decorations", "Seasonal Wreaths"] },
        ],
      },
      {
        key: "Sports & Outdoor",
        image: "sports_outdoor.jpg",
        subcategories: [
          { key: "Fitness & Exercise", subSubcategories: ["Cardio Equipment", "Strength Training", "Yoga Equipment", "Pilates Equipment", "Home Gym", "Exercise Accessories", "Recovery Equipment"] },
          { key: "Sports", subSubcategories: ["Football", "Basketball", "Baseball", "Volleyball", "Tennis", "Cricket", "American Football", "Golf", "Table Tennis", "Badminton"] },
          { key: "Water Sports", subSubcategories: ["Swimming", "Surfing", "Kayaking", "Diving", "Water Skiing", "Fishing", "Boating", "Water Safety"] },
          { key: "Outdoor & Camping", subSubcategories: ["Camping Gear", "Hiking Equipment", "Backpacking", "Climbing Gear", "Outdoor Clothing", "Navigation", "Survival Gear"] },
          { key: "Winter Sports", subSubcategories: ["Skiing", "Snowboarding", "Ice Skating", "Winter Clothing", "Snow Equipment", "Winter Accessories"] },
          { key: "Cycling", subSubcategories: ["Bicycles", "Bike Accessories", "Cycling Apparel", "Bike Maintenance", "Bike Safety", "E-Bikes"] },
          { key: "Running & Athletics", subSubcategories: ["Running Shoes", "Running Apparel", "Track & Field", "Marathon Gear", "Running Accessories", "Performance Monitoring"] },
          { key: "Sports Accessories", subSubcategories: ["Sports Bags", "Protective Gear", "Sports Nutrition", "Hydration", "Sports Technology", "Fan Gear"] },
          { key: "Sportswear", subSubcategories: ["Athletic Tops", "Athletic Bottoms", "Sports Bras", "Athletic Shoes", "Sports Accessories", "Team Jerseys"] },
        ],
      },
      {
        key: "Tools & Hardware",
        image: "tools_hardware.jpg",
        subcategories: [
          { key: "Hand Tools", subSubcategories: ["Hammers", "Screwdrivers", "Wrenches", "Pliers", "Saws", "Chisels", "Utility Knives", "Hand Tool Sets"] },
          { key: "Power Tools", subSubcategories: ["Drills", "Saws", "Sanders", "Grinders", "Routers", "Nail Guns", "Impact Drivers", "Multi-Tools"] },
          { key: "Hardware & Fasteners", subSubcategories: ["Screws", "Bolts & Nuts", "Nails", "Washers", "Anchors", "Hinges", "Handles & Knobs", "Chains"] },
          { key: "Electrical Supplies", subSubcategories: ["Wire & Cable", "Outlets & Switches", "Circuit Breakers", "Light Fixtures", "Electrical Tools", "Extension Cords"] },
          { key: "Plumbing Supplies", subSubcategories: ["Pipes & Fittings", "Valves", "Faucets", "Toilet Parts", "Drain Cleaners", "Pipe Tools", "Sealants"] },
          { key: "Building Materials", subSubcategories: ["Lumber", "Drywall", "Insulation", "Roofing Materials", "Flooring", "Concrete", "Paint"] },
          { key: "Safety Equipment", subSubcategories: ["Work Gloves", "Safety Glasses", "Hard Hats", "Ear Protection", "Respirators", "Safety Vests", "First Aid Kits"] },
          { key: "Measuring Tools", subSubcategories: ["Tape Measures", "Levels", "Squares", "Calipers", "Rulers", "Laser Levels", "Marking Tools"] },
          { key: "Tool Storage", subSubcategories: ["Tool Boxes", "Tool Bags", "Tool Chests", "Workshop Storage", "Tool Organizers"] },
        ],
      },
      {
        key: "Pet Supplies",
        image: "pet_supplies.jpg",
        subcategories: [
          { key: "Dog Supplies", subSubcategories: ["Dog Food", "Dog Toys", "Dog Beds", "Leashes & Collars", "Dog Clothing", "Dog Grooming", "Dog Training", "Dog Health Care"] },
          { key: "Cat Supplies", subSubcategories: ["Cat Food", "Cat Toys", "Cat Beds", "Litter & Boxes", "Cat Trees", "Cat Grooming", "Cat Carriers", "Cat Health Care"] },
          { key: "Bird Supplies", subSubcategories: ["Bird Food", "Bird Cages", "Bird Toys", "Bird Perches", "Bird Houses", "Bird Health Care", "Bird Accessories"] },
          { key: "Fish & Aquarium", subSubcategories: ["Fish Food", "Aquarium Tanks", "Aquarium Filters", "Aquarium Decorations", "Water Treatment", "Aquarium Lighting", "Fish Health Care"] },
          { key: "Small Animal Supplies", subSubcategories: ["Small Animal Food", "Cages & Habitats", "Small Animal Toys", "Bedding", "Water Bottles", "Exercise Equipment"] },
          { key: "Pet Food & Treats", subSubcategories: ["Dry Food", "Wet Food", "Treats & Snacks", "Supplements", "Special Diet Food", "Organic Food"] },
          { key: "Pet Care & Health", subSubcategories: ["Flea & Tick Control", "Vitamins & Supplements", "First Aid", "Dental Care", "Skin & Coat Care", "Health Monitoring"] },
          { key: "Pet Accessories", subSubcategories: ["Pet Carriers", "Pet Strollers", "Pet Gates", "Travel Accessories", "Pet ID Tags", "Cleanup Supplies"] },
          { key: "Pet Training", subSubcategories: ["Training Treats", "Training Tools", "Clickers", "Training Pads", "Behavioral Aids"] },
        ],
      },
      {
        key: "Automotive",
        image: "automotive.jpg",
        subcategories: [
          { key: "Car Parts & Components", subSubcategories: ["Engine Parts", "Brake Components", "Suspension Parts", "Transmission Parts", "Exhaust Systems", "Filters", "Belts & Hoses"] },
          { key: "Car Electronics", subSubcategories: ["Car Audio", "GPS & Navigation", "Dash Cams", "Car Alarms", "Bluetooth Adapters", "Backup Cameras"] },
          { key: "Car Care & Maintenance", subSubcategories: ["Motor Oil", "Car Wash Products", "Wax & Polish", "Car Cleaners", "Maintenance Tools", "Fluids"] },
          { key: "Tires & Wheels", subSubcategories: ["Tires", "Wheels", "Tire Accessories", "Wheel Covers", "Tire Pressure Monitors"] },
          { key: "Interior Accessories", subSubcategories: ["Seat Covers", "Floor Mats", "Steering Wheel Covers", "Air Fresheners", "Interior Organizers", "Sunshades"] },
          { key: "Exterior Accessories", subSubcategories: ["Car Covers", "Roof Racks", "Running Boards", "Mud Flaps", "License Plate Frames", "Decals"] },
          { key: "Tools & Equipment", subSubcategories: ["Jump Starters", "Tire Gauges", "Mechanics Tools", "Car Jacks", "Emergency Kits", "Diagnostic Tools"] },
          { key: "Motorcycle Parts", subSubcategories: ["Motorcycle Parts", "Motorcycle Accessories", "Motorcycle Gear", "Helmets", "Protective Clothing"] },
        ],
      },
      {
        key: "Health & Wellness",
        image: "health_wellness.jpg",
        subcategories: [
          { key: "Vitamins & Supplements", subSubcategories: ["Multivitamins", "Vitamin D", "Vitamin C", "B Vitamins", "Omega-3", "Probiotics", "Protein Supplements", "Herbal Supplements"] },
          { key: "Medical Equipment", subSubcategories: ["Blood Pressure Monitors", "Thermometers", "Glucose Meters", "Pulse Oximeters", "Stethoscopes", "Medical Scales"] },
          { key: "First Aid & Safety", subSubcategories: ["First Aid Kits", "Bandages", "Antiseptics", "Pain Relief", "Emergency Supplies", "Safety Equipment"] },
          { key: "Fitness & Exercise Equipment", subSubcategories: ["Home Gym Equipment", "Cardio Machines", "Weights & Dumbbells", "Resistance Bands", "Yoga Mats", "Exercise Bikes"] },
          { key: "Health Monitoring", subSubcategories: ["Fitness Trackers", "Smart Scales", "Heart Rate Monitors", "Sleep Trackers", "Health Apps"] },
          { key: "Mobility & Daily Living", subSubcategories: ["Mobility Aids", "Grab Bars", "Bath Safety", "Seat Cushions", "Daily Living Aids"] },
          { key: "Alternative Medicine", subSubcategories: ["Essential Oils", "Aromatherapy", "Massage Tools", "Acupuncture", "Natural Remedies"] },
          { key: "Personal Care", subSubcategories: ["Oral Care", "Incontinence Care", "Hearing Aids", "Vision Care", "Skin Care"] },
        ],
      },
    ],
    buyerToProductMapping: {
      Women: {
        Fashion: "Clothing & Fashion",
        Shoes: "Footwear",
        Accessories: "Accessories",
        Bags: "Bags & Luggage",
        "Self Care": "Beauty & Personal Care",
      },
      Men: {
        Fashion: "Clothing & Fashion",
        Shoes: "Footwear",
        Accessories: "Accessories",
        Bags: "Bags & Luggage",
        "Self Care": "Beauty & Personal Care",
      },
    },
  };