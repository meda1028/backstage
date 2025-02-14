/*
 * Copyright 2023 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @public */
export type NotificationSeverity = 'critical' | 'high' | 'normal' | 'low';

/** @public */
export type NotificationPayload = {
  title: string;
  description?: string;
  link?: string;
  // TODO: Add support for additional links
  // additionalLinks?: string[];
  severity: NotificationSeverity;
  topic?: string;
  scope?: string;
  icon?: string;
};

/** @public */
export type Notification = {
  id: string;
  user: string;
  created: Date;
  saved?: Date;
  read?: Date;
  updated?: Date;
  origin: string;
  payload: NotificationPayload;
};

/** @public */
export type NotificationStatus = {
  unread: number;
  read: number;
};

/** @public */
export type NewNotificationSignal = {
  action: 'new_notification';
  notification_id: string;
};

/** @public */
export type NotificationReadSignal = {
  action: 'notification_read' | 'notification_unread';
  notification_ids: string[];
};

/** @public */
export type NotificationSignal = NewNotificationSignal | NotificationReadSignal;
