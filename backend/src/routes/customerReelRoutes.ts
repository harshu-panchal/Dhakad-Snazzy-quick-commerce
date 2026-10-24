import { Router } from "express";
import { authenticate, requireUserType } from "../middleware/auth";
import { uploadReelVideo, handleUploadError } from "../middleware/upload";
import {
  getFeed,
  uploadReel,
  likeReel,
  shareReel,
  viewReel,
  myReels,
  earnings,
  removeReel,
} from "../modules/customer/controllers/customerReelController";

const router = Router();

// All reel routes require an authenticated customer
router.use(authenticate, requireUserType("Customer"));

// Specific routes first
router.get("/feed", getFeed);
router.get("/mine", myReels);
router.get("/earnings", earnings);

router.post(
  "/",
  uploadReelVideo.single("video"),
  handleUploadError,
  uploadReel
);

// Engagement
router.post("/:id/like", likeReel);
router.post("/:id/share", shareReel);
router.post("/:id/view", viewReel);

router.delete("/:id", removeReel);

export default router;
