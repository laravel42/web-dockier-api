import {
  ArrowLeft as LucideArrowLeft,
  ArrowRight as LucideArrowRight,
  BarChart3,
  Briefcase as LucideBriefcase,
  Calendar,
  Check as LucideCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed as LucideCircleDashed,
  Clock as LucideClock,
  Compass as LucideCompass,
  Cuboid,
  Download,
  Edit3,
  Ellipsis,
  EllipsisVertical,
  File as LucideFile,
  Flag as LucideFlag,
  FlaskConical,
  Funnel as LucideFunnel,
  GitMerge as LucideGitMerge,
  Globe2,
  GripVertical,
  Info as LucideInfo,
  LayoutDashboard,
  Link,
  List,
  LoaderCircle,
  type LucideIcon,
  type LucideProps,
  Maximize2,
  Mic,
  PanelRight,
  Paperclip as LucidePaperclip,
  Pause as LucidePause,
  Play as LucidePlay,
  Plus as LucidePlus,
  Rocket as LucideRocket,
  Rows3,
  Search,
  Share2,
  SkipBack as LucideSkipBack,
  SkipForward as LucideSkipForward,
  Sparkles,
  Star as LucideStar,
  Tag as LucideTag,
  Target as LucideTarget,
  TimerReset,
  Trash2,
  Upload,
  User as LucideUser,
  UserCircle,
  Users as LucideUsers,
  WandSparkles,
  Waves,
  X as LucideX,
  Zap,
} from "lucide-react";

type IconProps = LucideProps & {
  weight?: string;
};

function phosphorIcon(Icon: LucideIcon) {
  function WrappedIcon({ weight: _weight, ...props }: IconProps) {
    return <Icon {...props} />;
  }

  return WrappedIcon;
}

export const ArrowRight = phosphorIcon(LucideArrowRight);
export const ArrowLeft = phosphorIcon(LucideArrowLeft);
export const ArrowsClockwise = phosphorIcon(TimerReset);
export const ArrowsOutSimple = phosphorIcon(Maximize2);
export const Briefcase = phosphorIcon(LucideBriefcase);
export const CalendarBlank = phosphorIcon(Calendar);
export const CaretDown = phosphorIcon(ChevronDown);
export const CaretLeft = phosphorIcon(ChevronLeft);
export const CaretRight = phosphorIcon(ChevronRight);
export const ChartBar = phosphorIcon(BarChart3);
export const Check = phosphorIcon(LucideCheck);
export const CheckCircle = phosphorIcon(CheckCircle2);
export const CircleDashed = phosphorIcon(LucideCircleDashed);
export const CircleNotch = phosphorIcon(LoaderCircle);
export const Clock = phosphorIcon(LucideClock);
export const Compass = phosphorIcon(LucideCompass);
export const Cube = phosphorIcon(Cuboid);
export const DotsSixVertical = phosphorIcon(GripVertical);
export const DotsThree = phosphorIcon(Ellipsis);
export const DotsThreeVertical = phosphorIcon(EllipsisVertical);
export const DownloadSimple = phosphorIcon(Download);
export const File = phosphorIcon(LucideFile);
export const Flag = phosphorIcon(LucideFlag);
export const Flask = phosphorIcon(FlaskConical);
export const Funnel = phosphorIcon(LucideFunnel);
export const GitMerge = phosphorIcon(LucideGitMerge);
export const Globe = phosphorIcon(Globe2);
export const Info = phosphorIcon(LucideInfo);
export const Layout = phosphorIcon(LayoutDashboard);
export const Lightning = phosphorIcon(Zap);
export const LinkSimple = phosphorIcon(Link);
export const MagnifyingGlass = phosphorIcon(Search);
export const Microphone = phosphorIcon(Mic);
export const Paperclip = phosphorIcon(LucidePaperclip);
export const PencilSimpleLine = phosphorIcon(Edit3);
export const PencilSimple = phosphorIcon(Edit3);
export const Pause = phosphorIcon(LucidePause);
export const Play = phosphorIcon(LucidePlay);
export const Plus = phosphorIcon(LucidePlus);
export const Question = phosphorIcon(WandSparkles);
export const Rocket = phosphorIcon(LucideRocket);
export const Rows = phosphorIcon(Rows3);
export const ShareNetwork = phosphorIcon(Share2);
export const Export = phosphorIcon(Share2);
export const SkipBack = phosphorIcon(LucideSkipBack);
export const SkipForward = phosphorIcon(LucideSkipForward);
export const Spinner = phosphorIcon(LoaderCircle);
export const SquareHalf = phosphorIcon(PanelRight);
export const Star = phosphorIcon(LucideStar);
export const StarFour = phosphorIcon(Sparkles);
export const Tag = phosphorIcon(LucideTag);
export const Target = phosphorIcon(LucideTarget);
export const Timer = phosphorIcon(LucideClock);
export const Trash = phosphorIcon(Trash2);
export const UploadSimple = phosphorIcon(Upload);
export const User = phosphorIcon(LucideUser);
export const Users = phosphorIcon(LucideUsers);
export const UserCircleIcon = phosphorIcon(UserCircle);
export const UserCirclePhosphor = phosphorIcon(UserCircle);
export const WarningOctagon = phosphorIcon(WandSparkles);
export const Waveform = phosphorIcon(Waves);
export const X = phosphorIcon(LucideX);
export { List };

export { UserCirclePhosphor as UserCircle };
