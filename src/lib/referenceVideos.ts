// Vídeos de referência de execução: animações 3D de exercícios (boneco 3D com os músculos em destaque), de CANAIS DO YOUTUBE de terceiros
// (principalmente Muscle & Motion). São exibidos por incorporação oficial com crédito ao canal; nada é copiado para o servidor.
// Cada id foi conferido pelo oEmbed do YouTube (existe e permite incorporar); título e canal vêm de lá. Seleção em docs/PLANO-VIDEOS-ANIMACAO-3D.md.
// Exercícios sem entrada aqui não têm vídeo (os 16 com animação 3D própria continuam com ela).
export interface ReferenceVideo { id: string; title: string; author: string }
export const REFERENCE_VIDEOS: Record<string, ReferenceVideo> = {
  "Supino reto": {
    "id": "vunUexdi6NI",
    "title": "3D Anatomy of the Barbell Bench Press | Chest & Triceps Muscle Activation💪🔥#PectoralisMajor#Triceps#",
    "author": "Muscle Science 3D"
  },
  "Crucifixo": {
    "id": "M2fNYfym6Eo",
    "title": "Cable Fly vs Dumbbell Fly: Which Builds More Chest? | 3D Anatomical Fitness Guide",
    "author": "Fit Anatomy 3D"
  },
  "Flexão de braço": {
    "id": "qpcBos-EUug",
    "title": "How to do a Proper Push Up: Watch the muscles in 3D & learn to avoid a common mistake.",
    "author": "Muscle & Motion"
  },
  "Pull-over": {
    "id": "ZmijCSRBW5E",
    "title": "Dumbbell Pullover",
    "author": "Muscle & Motion"
  },
  "Barra fixa": {
    "id": "swLoMW9WFZI",
    "title": "Pull Ups & Dips with Muscular Analysis",
    "author": "Muscle & Motion"
  },
  "Levantamento terra": {
    "id": "o5FvhPAZ_yw",
    "title": "How to Deadlift Properly: 3D Animation of Muscles in Motion",
    "author": "Muscle & Motion"
  },
  "Puxada frontal": {
    "id": "or-b1psncs4",
    "title": "Mastering the Lat Pulldown for a Stronger Back",
    "author": "Muscle & Motion"
  },
  "Remada curvada": {
    "id": "jOr03vOvMH0",
    "title": "Smith Machine Bent-Over Row: Strengthen Your Back with Control",
    "author": "Muscle & Motion"
  },
  "Remada unilateral com halter": {
    "id": "xIjW4nmaIOo",
    "title": "How to One Arm Dumbbell Row, 3d animation, gif",
    "author": "Planfit"
  },
  "Remada na máquina": {
    "id": "Ly0TerDmMuI",
    "title": "How to Seated Row Machine, 3D animation,gif",
    "author": "Planfit"
  },
  "Remada no cross": {
    "id": "K-h-DFseHfk",
    "title": "Seated Cable Row Male – What Muscles Actually Work 3D Anatomy – TrainHive",
    "author": "TrainHive"
  },
  "Elevação lateral": {
    "id": "WtP691z7Wz8",
    "title": "Dumbbell Side Lateral Raise",
    "author": "Muscle & Motion"
  },
  "Elevação frontal": {
    "id": "1FRgeRRCi0g",
    "title": "3D Dumbbell Front Raise Animation | Realistic Fitness Exercise",
    "author": "JOHN OLUWASEMILORE"
  },
  "Elevação frontal no cross": {
    "id": "YpYHhw4Jhrs",
    "title": "Cable One Arm Front Raise",
    "author": "Gym Animations"
  },
  "Crucifixo inverso": {
    "id": "bKu9Ys175VY",
    "title": "Maximize Posterior Deltoid Gains with the Machine Reverse Fly",
    "author": "Muscle & Motion"
  },
  "Desenvolvimento militar": {
    "id": "XJGvZbDM8iY",
    "title": "Anatomy and Biomechanics of the Military Press",
    "author": "Kinetic Library"
  },
  "Manguito rotador (rotação externa)": {
    "id": "lw5jkvrLwVw",
    "title": "Strengthen Your Rotator Cuff: Shoulder External Rotation with Mini Band",
    "author": "Muscle & Motion"
  },
  "Encolhimento": {
    "id": "RwX1K9Qn4Uk",
    "title": "AOVALO dumbbell shrug fitness exercise workout animation video male",
    "author": "AOVALO"
  },
  "Remada alta": {
    "id": "pT4njrC59fk",
    "title": "Upright Row - Good or Bad?",
    "author": "Muscle & Motion"
  },
  "Paralelas": {
    "id": "rZl4D4p_nO4",
    "title": "Dips - Variations with Target Muscles and Synergists",
    "author": "Muscle & Motion"
  },
  "Mergulho": {
    "id": "arZWKRN9PJY",
    "title": "Bench Dip - Dangerous Zone",
    "author": "Muscle & Motion"
  },
  "Supino fechado": {
    "id": "1cFDN5aSKtw",
    "title": "Barbell Close Grip Bench Press",
    "author": "Muscle & Motion"
  },
  "Tríceps testa com barra": {
    "id": "vYZVUUS-72Q",
    "title": "Arms: Lying Tricep Bar Extension - Triceps (Exercise/Anatomy)",
    "author": "FitAnatomy"
  },
  "Tríceps na polia": {
    "id": "4r3GdBAnHqc",
    "title": "Work on your Triceps with Cable One Arm Push-down",
    "author": "Muscle & Motion"
  },
  "Tríceps unilateral na polia": {
    "id": "4r3GdBAnHqc",
    "title": "Work on your Triceps with Cable One Arm Push-down",
    "author": "Muscle & Motion"
  },
  "Tríceps coice": {
    "id": "IQzfREbIfVg",
    "title": "\"Triceps Kickback\" Exercise (Learn the Muscles!)",
    "author": "Dance Cube"
  },
  "Rosca direta": {
    "id": "Qe16Y1ZJkyY",
    "title": "Barbell Curl Male – What Muscles Actually Work 3D Anatomy – TrainHive",
    "author": "TrainHive"
  },
  "Rosca martelo": {
    "id": "2HPs8LYJNYM",
    "title": "4K Hammer Curls Stock Animation",
    "author": "D3igital"
  },
  "Rosca scott": {
    "id": "_O1rZ7ghM3c",
    "title": "How to Do One-Arm Preacher Curls and a Common mistake",
    "author": "Muscle & Motion"
  },
  "Rosca concentrada": {
    "id": "NiWoiu7WL-Y",
    "title": "Dumbbell Concentration Curl | 3D Anatomy",
    "author": "Muscle & Motion"
  },
  "Flexão de punho": {
    "id": "DQPkmTJpnk4",
    "title": "3D Animation of Wrist Curls Exercise with Anatomical Muscle Highlight",
    "author": "SHABBIR 45"
  },
  "Agachamento livre": {
    "id": "eb4rKCM3BKM",
    "title": "How to do a Squat Properly: Watch the Muscles in 3D",
    "author": "Muscle & Motion"
  },
  "Agachamento frontal": {
    "id": "7jbJq5am4sw",
    "title": "Front Squat Anatomy",
    "author": "BSU Masters Degree - Strength & Conditioning"
  },
  "Agachamento sumô": {
    "id": "BE_9UDq5X5k",
    "title": "\"Sumo Squat\" Exercise (Learn the Muscles!)",
    "author": "Dance Cube"
  },
  "Agachamento búlgaro": {
    "id": "xyn1-o3NkLg",
    "title": "Bulgarian Split Squat Vs. Skater Squat",
    "author": "Muscle & Motion"
  },
  "Passada": {
    "id": "5DadWZno5N0",
    "title": "Weighted walking lunge (kettlebell)",
    "author": "Muscle & Motion"
  },
  "Afundo": {
    "id": "SGwpAzYVNfc",
    "title": "Overhead Lunge I Anatomical analysis & Mistakes to avoid",
    "author": "Muscle & Motion"
  },
  "Avanço": {
    "id": "te8GLt4IpZo",
    "title": "Forward lunges | Tutorial | The Muscle Movement",
    "author": "The Muscle Movement"
  },
  "Leg press 45°": {
    "id": "QDnCR1eOOPw",
    "title": "Leg Press Anatomy",
    "author": "Muscle & Motion"
  },
  "Stiff": {
    "id": "W40UxQXeaFE",
    "title": "Lifting Injury Risk, Stiff-leg Deadlift and more.",
    "author": "Muscle & Motion"
  },
  "Cadeira flexora": {
    "id": "PvkDCShhyL0",
    "title": "AOVALO seated leg curl machine fitness exercise workout animation",
    "author": "AOVALO"
  },
  "Glúteo em 4 apoios": {
    "id": "_VPHlGhgYdg",
    "title": "Gluteus Maximus - Kickback",
    "author": "Muscle & Motion"
  },
  "Glúteo no cross": {
    "id": "_VPHlGhgYdg",
    "title": "Gluteus Maximus - Kickback",
    "author": "Muscle & Motion"
  },
  "Elevação pélvica": {
    "id": "3PY_WZ2xS10",
    "title": "Single-Leg Hip Thrust: Build Stronger Glutes Without Adding Weight",
    "author": "Muscle & Motion"
  },
  "Cadeira adutora": {
    "id": "DzXN930lttA",
    "title": "Exercise for Building Hip Adductor Strength and Preventing Injury",
    "author": "Muscle & Motion"
  },
  "Panturrilha em pé": {
    "id": "NNy8-kDjyXo",
    "title": "BIGGER CALVES: Standing vs Seated Calf Raise | Which One Builds More Muscle? | Dr. HealthoraCare",
    "author": "🩺 Dr. HealthoraCare"
  },
  "Panturrilha sentado": {
    "id": "NNy8-kDjyXo",
    "title": "BIGGER CALVES: Standing vs Seated Calf Raise | Which One Builds More Muscle? | Dr. HealthoraCare",
    "author": "🩺 Dr. HealthoraCare"
  },
  "Panturrilha no leg press": {
    "id": "cPt_Op0uh5k",
    "title": "AOVALO bodyweight calf raise fitness exercise workout animation",
    "author": "AOVALO"
  },
  "Abdominal supra": {
    "id": "-T-HCBDSNRw",
    "title": "Crunch Female – What Muscles Actually Work 3D Anatomy – TrainHive",
    "author": "TrainHive"
  },
  "Prancha": {
    "id": "AwFaqk3kNJk",
    "title": "Plank Exercise Explained in 3D Anatomy  Correct Form, Core Muscles & Injury Prevention",
    "author": "Biomech Body3D"
  },
  "Extensão lombar": {
    "id": "XI6G2ZP_Y8w",
    "title": "45 Degree Back Extension Male – What Muscles Actually Work 3D Anatomy – TrainHive",
    "author": "TrainHive"
  },
  "Flexão de pescoço": {
    "id": "jGV_RTfRGF4",
    "title": "Head/Neck Flexion with 3D animation",
    "author": "Amir nawaz Khan"
  }
};
export const youtubeWatchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
