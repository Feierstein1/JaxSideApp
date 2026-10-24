import { topicPosts } from '@/server/discussions/handlers';
import { route } from '@/server/http';

/** D125: a topic's posts (a read; POST because it carries the location reading). */
export const POST = route(topicPosts);
